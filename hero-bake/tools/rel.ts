import { handAt, heroCardPose } from '../src/story/story';
for (const p of [0.2,0.25,0.275,0.285,0.295,0.305,0.315,0.325,0.34,0.36,0.38,0.4,0.45]) {
  const q = heroCardPose(p), h = handAt(p)!;
  console.log(p.toFixed(3), 'card pos', q.pos.map(v=>v.toFixed(2)).join(','), 'hand pos', [h.M[12],h.M[13],h.M[14]].map(v=>v.toFixed(2)).join(','), 'open', h.open.toFixed(2));
}
