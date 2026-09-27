#!/usr/bin/env python3
"""Describe every 30 s chunk of a video with the local Qwen server.

Usage: qwen-chunks.py <chunk dir> <out.jsonl> [prompt file]
Chunks are named c000.mp4, c001.mp4, ... and each is 30 s long, so chunk N
starts at N*30 s. Resumable: chunks already in <out.jsonl> are skipped.
"""
import json, pathlib, sys, time, urllib.request

CHUNK_SECONDS = 30
DEFAULT_PROMPT = """This is a 30 second clip of gameplay from an open-world street racing game with police pursuits. The clip starts at {start} into the video.

Report what happens as a timeline. For each thing that happens give the time within the clip in seconds (0-30) and one short line. Include:
- the game mode: menu, cutscene, free roam, race, speed run, pursuit, cooldown/escape, loading screen
- police: how many cop cars are visible, where they are relative to the player (behind, alongside, ahead), roadblocks, spike strips, helicopters, rams
- crashes, spins, takedowns, jumps, near misses, driving against traffic
- the kind of road: highway, city street, tunnel, bridge, off-road, railway, alley, parking lot, and how busy the traffic is
- any on-screen text you can read (banners, prompts, results, the street name under the minimap)

Then one line starting SUMMARY: that says what this 30 seconds is about. Do not guess at things you cannot see."""


def fmt(s):
    return f"{int(s // 60):02d}:{int(s % 60):02d}"


def ask(path, prompt):
    body = {
        "model": "qwen",
        "max_tokens": 900,
        "temperature": 0.2,
        "chat_template_kwargs": {"enable_thinking": False},
        "mm_processor_kwargs": {"fps": 2},
        "messages": [{"role": "user", "content": [
            {"type": "video_url", "video_url": {"url": f"file://{path}"}},
            {"type": "text", "text": prompt},
        ]}],
    }
    req = urllib.request.Request("http://localhost:8000/v1/chat/completions",
                                 data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    return d["choices"][0]["message"]["content"], d.get("usage", {})


def main():
    chunk_dir, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    template = pathlib.Path(sys.argv[3]).read_text() if len(sys.argv) > 3 else DEFAULT_PROMPT
    done = set()
    if out.exists():
        done = {json.loads(l)["chunk"] for l in out.read_text().splitlines() if l.strip()}
    chunks = sorted(chunk_dir.glob("c*.mp4"))
    for c in chunks:
        n = int(c.stem[1:])
        if n in done:
            continue
        start = n * CHUNK_SECONDS
        t0 = time.time()
        try:
            text, usage = ask(c.resolve(), template.format(start=fmt(start)))
        except Exception as e:  # keep going; a rerun retries the gaps
            text, usage = f"ERROR: {e}", {}
        rec = {"chunk": n, "start": fmt(start), "seconds": round(time.time() - t0, 1),
               "tokens": usage.get("prompt_tokens"), "text": text}
        with out.open("a") as f:
            f.write(json.dumps(rec) + "\n")
        print(f"{rec['start']} {rec['seconds']}s {rec['tokens']} tok", flush=True)


if __name__ == "__main__":
    main()
