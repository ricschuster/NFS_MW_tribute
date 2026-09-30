// The areas of Kestrel Head's castle (#454), in world metres: what is cobbled
// inside its walls. Written with the walls by the same layout (see
// docs/research/kestrel-head-castle.md), so the stone and the setts agree.
import { UNITS_PER_METRE } from '../constants';
import type { Vec2 } from './types';

const points = (list: [number, number][]): Vec2[] => list.map(([x, z]) => ({ x: x * UNITS_PER_METRE, z: z * UNITS_PER_METRE }));

/** The outer bailey along the road up, the inner castle round the summit, and the south ward along the ridge. */
export const CASTLE_AREAS: { bailey: Vec2[]; court: Vec2[]; ward: Vec2[] } = {
  bailey: points([[1245.7, -316.7], [1307.4, -419.6], [1372.6, -380.4], [1310.9, -277.6]]),
  court: points([[1408.2, -556.0], [1418.5, -550.4], [1427.6, -543.1], [1435.4, -534.2], [1441.8, -524.0], [1446.5, -512.7], [1449.5, -500.6], [1450.6, -488.0], [1449.8, -475.2], [1447.3, -462.6], [1442.9, -450.3], [1436.9, -438.8], [1429.3, -428.3], [1420.4, -419.0], [1410.4, -411.3], [1399.5, -405.3], [1388.0, -401.1], [1376.2, -398.8], [1364.4, -398.5], [1352.8, -400.3], [1341.8, -404.0], [1336.2, -407.6], [1331.5, -412.9], [1328.0, -419.9], [1325.6, -428.4], [1324.4, -438.1], [1324.5, -448.9], [1325.8, -460.4], [1328.3, -472.4], [1332.0, -484.7], [1336.7, -496.8], [1342.4, -508.4], [1348.9, -519.4], [1356.0, -529.4], [1363.6, -538.2], [1371.4, -545.6], [1379.4, -551.3], [1387.2, -555.3], [1394.8, -557.5], [1401.8, -557.7]]),
  ward: points([[1453.9, -473.7], [1558.3, -548.4], [1597.1, -640.6], [1592.3, -757.0], [1529.2, -800.6], [1456.5, -766.7], [1427.4, -679.4], [1422.5, -601.8]]),
};
