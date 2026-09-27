# Tools for reviewing gameplay footage

How [the 2012 review](../../nfs-most-wanted-2012-gameplay.md) was made, kept so
it can be rerun on this video or used on another one. None of this is part of
the game or its build: it is Python and shell run against a video file that
lives in `reference/`, which is git-ignored because the footage is third-party.

Everything runs locally. The machine it was written on has an RTX 3090 (24 GB)
and 48 cores; the notes below say where that matters.

## Setup

Three separate Python environments, because their dependencies do not share:

| What | Where | Why separate |
|---|---|---|
| `whisper` (speech to text) | `pipx install openai-whisper` | Its own CLI with its own torch |
| Frames, OCR, tracking | `~/.venvs/video`: `opencv-python-headless numpy torch torchvision torchaudio ultralytics pytesseract demucs` | Python 3.14 is fine here |
| vLLM + Qwen | `uv venv --python 3.12 ~/.venvs/vllm` then `uv pip install vllm --torch-backend=auto` | vLLM had no wheels for 3.14 |

Plus the system packages `ffmpeg` and `tesseract`, and the model:
`hf download Lorbus/Qwen3.6-27B-int4-AutoRound` (18 GB, a 4-bit AutoRound
quant). It was chosen over the more popular `cyankiwi/Qwen3.6-27B-AWQ-INT4`
because that one is 20.5 GB and left no room for video on a 24 GB card with a
desktop running.

## Serving Qwen: three things that went wrong

`qwen-start.sh`, `qwen-wait.sh` and `qwen-stop.sh` exist because of these.

1. **Memory.** At `--max-model-len 32768` the KV cache needs 2.3 GiB and only
   2.11 GiB is left after the weights. 24576 fits: about 30k tokens of cache,
   one request's worth of video at a time.
2. **FlashInfer's JIT needs a newer `nvcc` than the system's 12.4** (it passes
   `--compress-mode=size`). `VLLM_USE_FLASHINFER_SAMPLER=0` uses vLLM's own
   sampler instead. The JIT also needs `ninja`, which is in the venv but not on
   `PATH` unless the venv's `bin` is put there.
3. **Never find the server by name.** `pgrep -f "vllm serve"` run from a shell
   whose own command line contains `vllm serve` matches itself: a wait loop
   built on it never noticed the server had died and sat out its full timeout,
   twice, and a `pkill -f` killed its own shell. The scripts write the server's
   PID to a file and only ever check or kill that PID, and the wait exits on
   the first of ready, logged error, or process death.

Start-up takes about three minutes (weights, `torch.compile`, CUDA graphs).
Set `QWEN_VIDEO_DIR` to move the work folder from `~/.local/share/qwen-video`;
vLLM will only read local media from `$QWEN_VIDEO_DIR/work`.

## The pipeline

Run from the work folder. `V` is the video.

```sh
# 1. Frames and crops, one per second (ffmpeg, CPU)
ffmpeg -i "$V" -vf "fps=1,scale=960:-2" -q:v 3 frames1/%05d.jpg
ffmpeg -i "$V" -vf "fps=1,crop=84:44:1145:640,scale=168:88" ocr/spdall/%05d.png          # speedometer
ffmpeg -i "$V" -filter_complex "fps=1,split=2[a][b];[a]crop=220:22:18:502,format=gray[c];[b]crop=220:22:18:690,format=gray[d]" \
       -map "[c]" ocr/dist/%05d.png -map "[d]" ocr/street/%05d.png                        # minimap labels
ffmpeg -i "$V" -filter_complex "fps=1,split=2[a][b];[a]crop=760:80:260:575,format=gray[c];[b]crop=900:90:190:225,format=gray[d]" \
       -map "[c]" ocr/cap/%05d.png -map "[d]" ocr/ban/%05d.png                            # captions, banners

# 2. Contact sheets to look at (timestamp burned in)
ffmpeg -i "$V" -vf "fps=1/15,scale=480:-2,drawtext=text='%{pts\:hms}':x=190:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=4x4" sheets/s%02d.jpg
# denser, for a stretch starting at second S:  -ss S -t LEN ... drawtext=text='%{pts\:hms\:S}' ... fps=1/2 ... tile=4x5

# 3. Text on screen (tesseract, 40 processes)
python ocr-bands.py  ocr/cap    > ocr/captions.txt
python ocr-bands.py  ocr/ban    > ocr/banners.txt
python ocr-labels.py ocr/dist   > ocr/dist.tsv
python ocr-labels.py ocr/street > ocr/street.tsv

# 4. Traffic (YOLO on CPU, ~2 min for 47 min of video)
python traffic-count.py frames1 traffic.tsv

# 5. With the Qwen server up
python qwen-speed.py  ocr/spdall ocr/speed.tsv     # ~40 min shared with step 6
python qwen-chunks.py chunks qwen-pass1.jsonl       # chunks: ffmpeg -f segment -segment_time 30, 640 px, 4 fps

# 6. Join it all
python analyse.py . timeline.tsv
```

Crop coordinates are for this video's 1280x720 HUD and will need finding again
for any other source.

## What each tool is good for, measured

- **Contact sheets, read by eye.** The primary source. Every claim in the review
  about what happened was checked on frames at 1-3 s spacing.
- **`qwen-speed.py`.** Tesseract cannot read the game's italic, segmented
  speedometer digits (2 of 4 on a test, even after un-slanting and dilating).
  Qwen reads a tile of 24 numbered crops per request and gets them right; its
  averages match the game's own results screens to within 7 km/h. It answers
  `cell: N` in order without numbering, so the script parses by position and
  marks a batch `?` if the count is off (6 of 118 batches were).
- **`ocr-labels.py`.** The minimap's district and street labels are a plain
  font and read well. `analyse.py` normalises the district against the eight
  known names; the street column keeps Tesseract's spelling.
- **`ocr-bands.py`.** Captions and banners over a moving scene. Readable lines
  come out cleanly and the rest is noise, which is left in the output rather
  than guessed at.
- **Minimap colour (in `analyse.py`).** Cooldown (cyan) is reliable. The red
  "seen" tint washes out in daylight and under-counts badly - the Most Wanted
  race registers only in fragments though the heat is on throughout.
- **`traffic-count.py`.** Rough: distant cars are missed and parked cars are
  counted. Good for "how often is anything on screen", not for a density.
- **`qwen-chunks.py`.** A 30 s summary per chunk. Useful as an index; not a
  source. It invented police three times in 47 minutes (09:00, 10:30, 44:00),
  mislabels events and names cars wrongly. Its output is kept as
  `data/qwen-index-unverified.jsonl` and should be read with that in mind.
- **Whisper.** On the raw soundtrack it loops ("Let's go", "I don't know") for
  minutes at a time under the music. Separating the voice first with Demucs
  (`python -m demucs --two-stems=vocals -d cpu -j 8`, about 40 s per 3.5 min)
  and running `whisper --model turbo --condition_on_previous_text False` on the
  vocals recovered the police radio for all three pursuits. The on-screen
  captions are a second, more reliable source for the lines they show.
- **RAFT optical flow and YOLO tracking** were tested and work (camera pan and
  ground flow from `torchvision`'s RAFT; per-car tracks from ultralytics +
  ByteTrack) but were not needed for this review: the speedometer gave speed
  directly.
