import { createServer } from 'vite';
const server = await createServer({ appType:'custom', server:{middlewareMode:true}, logLevel:'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { AUTHORED_ROADS } = await server.ssrLoadModule('/src/game/city/roads.ts');
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_SEED, CITY_LAND_STREAM, CITY_WIDTH, CITY_DEPTH, UNITS_PER_METRE } = C;
const b={minX:-CITY_WIDTH/2,minZ:-CITY_DEPTH/2,maxX:CITY_WIDTH/2,maxZ:CITY_DEPTH/2};
const water=makeWater(new Rng(CITY_LAND_STREAM),b);
const city=generateCity(CITY_SEED);
await server.close();
const toM=v=>v/UNITS_PER_METRE;
// how much of each authored road survived, by sampling its points against the
// finished graph
const seg=[];
for(const r of city.roads) seg.push([city.nodes[r.a].pos, city.nodes[r.b].pos]);
const near=(p)=>{let best=1e18;for(const [a,bb] of seg){const dx=bb.x-a.x,dz=bb.z-a.z,s=dx*dx+dz*dz;
 const t=s<1e-9?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/s));
 best=Math.min(best,Math.hypot(a.x+dx*t-p.x,a.z+dz*t-p.z));if(best<500)break;} return best;};
let missing=[];
for(const r of AUTHORED_ROADS){
  let gone=0;
  for(const p of r.points) if(near(p) > 40*UNITS_PER_METRE) gone++;
  const frac=gone/r.points.length;
  if(frac>0.3){
    let len=0; for(let i=1;i<r.points.length;i++) len+=Math.hypot(r.points[i].x-r.points[i-1].x,r.points[i].z-r.points[i-1].z);
    missing.push({id:r.id, pct:Math.round(frac*100), km:(toM(len)/1000).toFixed(2), wet: water.isWater(r.points[0].x,r.points[0].z)});
  }
}
missing.sort((a,b)=>Number(b.km)-Number(a.km));
console.log('authored roads mostly missing from the city:');
for(const m of missing) console.log(`  ${m.id.padEnd(5)} ${m.km} km  ${m.pct}% of its points have no road within 40 m`);
console.log('total missing:', missing.reduce((s,m)=>s+Number(m.km),0).toFixed(1), 'km of', AUTHORED_ROADS.length, 'roads');
