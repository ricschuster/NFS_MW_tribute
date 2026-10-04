"""Concept images of an original coupe with local FLUX.1-schnell (Apache-2.0).

Why: TRELLIS.2 only adds detail when its input already has it (see
docs/research/car-pilot-trellis.md, Runs 1 and 2), so the input has to be a
detailed concept image from a licence-clean source. The prompt names no real
car. Prompt, seed, model and date go to `<out>/log.json` for the credits row.

  ~/micromamba-bin/bin/micromamba run -n flux python tools/trellis/flux_concept.py OUT_DIR [--seeds 1,2,3,4] [--prompt-id 0]
"""
import argparse, json, datetime, pathlib, torch
from diffusers import FluxPipeline

PROMPTS = [
    "studio photograph of a sleek original two-door sports coupe in glossy red, "
    "three-quarter front view, plain light grey background, soft studio lighting, "
    "low wide stance, five-spoke alloy wheels, LED headlights, detailed glass and "
    "grille, automotive catalogue photo, sharp focus, full car in frame",
    "studio photograph of a sleek original two-door sports coupe in glossy red, "
    "side profile view, plain light grey background, soft studio lighting, "
    "separate clearly visible wheels with tyres, tinted windows with visible "
    "reflections, automotive catalogue photo, sharp focus, full car in frame",
    # 2: p0 came back with real badges (a Toyota logo, Mustang ponies), so ask
    # for an unbranded, one-off design instead.
    "studio photograph of an unbranded one-off concept sports coupe prototype in "
    "glossy red, three-quarter front view, plain light grey background, "
    "completely blank smooth grille and nose with no badge, no logo, no emblem, "
    "no lettering, distinctive original angular bodywork, five-spoke alloy "
    "wheels, tinted glass, sharp focus, full car in frame",
]

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--seeds', default='1,2,3,4')
ap.add_argument('--prompt-id', type=int, default=0)
a = ap.parse_args()
out = pathlib.Path(a.out).expanduser(); out.mkdir(parents=True, exist_ok=True)
prompt = PROMPTS[a.prompt_id]
pipe = FluxPipeline.from_pretrained('black-forest-labs/FLUX.1-schnell', torch_dtype=torch.bfloat16)
pipe.enable_sequential_cpu_offload()  # the 23 GB transformer does not fit whole beside the GPU desktop use
logp = out / 'log.json'
log = json.loads(logp.read_text()) if logp.exists() else []
for s in [int(x) for x in a.seeds.split(',')]:
    img = pipe(prompt, height=768, width=1024, guidance_scale=0.0, num_inference_steps=4,
               max_sequence_length=256, generator=torch.Generator('cpu').manual_seed(s)).images[0]
    name = f'p{a.prompt_id}_s{s}.png'
    img.save(out / name)
    log.append(dict(file=name, model='black-forest-labs/FLUX.1-schnell', prompt=prompt, seed=s,
                    steps=4, size='1024x768', date=datetime.date.today().isoformat()))
    logp.write_text(json.dumps(log, indent=1))
    print('saved', name, flush=True)
