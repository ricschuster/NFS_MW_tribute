"""The Kestrel, authored in Blender by script (ADR-0013 route D spike, #584).

Nothing generated and nothing third-party: every shape below is numbers in this
file. Why a script: a car has to be regenerable and the owner does not model
by hand. The body is a lofted shell (cross-section rings along the car, the way
`scene/carshape.ts` does it) smoothed by subdivision, with arches cut by
boolean; glass, lamps, mirrors and the four wheels are separate nodes so the
game can spin and steer the wheels (`poseWheels`) and glow the lamps.

  blender -b -P tools/cars/kestrel.py -- OUT.glb [PREVIEW_PREFIX]

Metres, nose toward -Y in Blender (glTF export makes that +Z, the game's nose).
Node names are the loader's contract: body first, then glass, wheel_fl/fr/rl/rr,
lamp_head_l/r, lamp_tail_l/r, mirror_l/r, grille, exhaust.
"""
import bpy, bmesh, math, sys, mathutils
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/kestrel.glb'
PREVIEW = args[1] if len(args) > 1 else None

# ---- dimensions --------------------------------------------------------------
L = 3.7            # overall length
HW = 0.86          # body half-width
CLEAR = 0.15       # ground clearance
TYRE_R = 0.315
WHEELZ = 1.16      # hub distance from centre, fore and aft
WHEEL_X = 0.74     # hub x
TYRE_W = 0.22
PAINT = (0.62, 0.07, 0.04, 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, color, metal=0.0, rough=0.5, emit=None, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = color
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if coat: b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = emit
        b.inputs['Emission Strength'].default_value = 3.0
    return m
M_PAINT = mat('paint', PAINT, 0.15, 0.4, coat=0.35)
M_TRIM = mat('trim', (0.02, 0.02, 0.025, 1), 0.0, 0.7)
M_GLASS = mat('glass', (0.02, 0.03, 0.04, 1), 0.0, 0.05)
M_TYRE = mat('tyre', (0.025, 0.025, 0.027, 1), 0.0, 0.85)
M_RIM = mat('rim', (0.7, 0.72, 0.75, 1), 1.0, 0.25)
M_DISC = mat('disc', (0.12, 0.12, 0.13, 1), 0.8, 0.5)
M_CALIPER = mat('caliper', (0.7, 0.05, 0.04, 1), 0.2, 0.4)
M_HEAD = mat('lamp_head', (0.9, 0.95, 1, 1), 0.0, 0.1, emit=(0.8, 0.9, 1, 1))
M_TAIL = mat('lamp_tail', (0.9, 0.05, 0.03, 1), 0.0, 0.2, emit=(1, 0.05, 0.02, 1))
M_CHROME = mat('chrome', (0.8, 0.8, 0.82, 1), 1.0, 0.2)
M_PLATE = mat('plate', (0.85, 0.85, 0.8, 1), 0.0, 0.5)

# ---- profile curves along the car -------------------------------------------
def pchip(keys, x):
    """Monotone cubic through (x, y) keys: smooth without overshoot."""
    xs = [k[0] for k in keys]; ys = [k[1] for k in keys]
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    n = len(xs)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [0 if d[i - 1] * d[i] <= 0 else 2 / (1 / d[i - 1] + 1 / d[i]) for i in range(1, n - 1)] + [d[-1]]
    i = max(j for j in range(n - 1) if xs[j] <= x)
    h = xs[i + 1] - xs[i]; t = (x - xs[i]) / h
    h00 = 2*t**3 - 3*t**2 + 1; h10 = t**3 - 2*t**2 + t; h01 = -2*t**3 + 3*t**2; h11 = t**3 - t**2
    return h00*ys[i] + h10*h*m[i] + h01*ys[i+1] + h11*h*m[i+1]

# t runs tail (0) to nose (1). Heights in metres above the ground.
ROOF = [(0, .70), (.025, .88), (.07, .93), (.20, 1.02), (.32, 1.15), (.44, 1.27), (.54, 1.28),
        (.62, 1.18), (.71, .90), (.80, .74), (.90, .66), (.97, .54), (1, .46)]
BELT = [(0, .78), (.04, .92), (.15, .95), (.35, .93), (.6, .88), (.75, .84), (.9, .72), (1, .55)]
def roof(t): return pchip(ROOF, t)
def belt(t): return pchip(BELT, t)

def half_width(t):
    u = abs(2 * t - 1)
    e = max(0.0, min(1.0, (u - 0.76) / 0.24))
    h = HW * (1 - e ** 2.8) ** 0.5
    return h * (1 + 0.04 * math.exp(-(((t - 0.17) / 0.09) ** 2)) + 0.03 * math.exp(-(((t - 0.80) / 0.09) ** 2)))   # rear haunch

def bottom(t):
    u = abs(2 * t - 1)
    return CLEAR + 0.2 * max(0.0, (u - 0.72) / 0.28) ** 2

# ---- body shell --------------------------------------------------------------
def ring(t):
    """One cross-section, right half bottom->top, as (x, z)."""
    hw = half_width(t); B = bottom(t); Bl = belt(t); R = max(roof(t), Bl + 0.002)
    ch = R - Bl
    cab = max(0.0, min(1.0, ch / 0.18))
    gx = hw * 0.9
    rw = gx - (gx - 0.56) * cab
    top = Bl + 0.03
    pts = [
        (0.0, B),
        (hw * 0.80, B),
        (hw * 0.96, B + 0.045),
        (hw * 1.0, B + (Bl - B) * 0.30),
        (hw * 0.955, B + (Bl - B) * 0.55),
        (hw * 1.0, Bl - 0.085),
        (hw * 0.90, Bl),
        (gx, Bl + 0.012),
        (gx + (rw - gx) * 0.35, Bl + ch * 0.45),
        (rw * 1.0, Bl + ch * 0.93),
        (rw * 0.8, Bl + ch * 1.0 + 0.012),
        (0.0, Bl + ch * 1.0 + 0.02),
    ]
    return pts

N = 64
ts = [0.5 - 0.5 * math.cos(math.pi * i / N) for i in range(N + 1)]
bm = bmesh.new()
rings = []
for t in ts:
    half = ring(t); y = -(t - 0.5) * L   # nose (t=1) toward -Y
    # right side bottom->top then centre top, then left side top->bottom
    right = [(x, y, z) for x, z in half]
    left = [(-x, y, z) for x, z in reversed(half[1:-1])]
    rings.append([bm.verts.new(p) for p in right + left])
for a, b in zip(rings, rings[1:]):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        try: bm.faces.new((a[i], a[j], b[j], b[i]))
        except ValueError: pass
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.faces.ensure_lookup_table(); bm.verts.index_update()
# Glass is decided on the lofted grid, before smoothing, so its edges are the
# grid's straight lines rather than a staircase of subdivided faces. A ring is
# 22 points: right half 0-11 (bottom centre to roof centre), then the left half.
crease = bm.edges.layers.float.new('crease_edge')
ring_of = {v: (i, j) for i, r in enumerate(rings) for j, v in enumerate(r) if v.is_valid}
for e in bm.edges:
    a, b = e.verts
    if a in ring_of and b in ring_of:
        (ia, ja), (ib, jb) = ring_of[a], ring_of[b]
        if ia == ib and {ja, jb} in ({6, 7}, {2, 3}, {15, 16}, {19, 20}):
            e[crease] = 1.0
        elif ia == ib and {ja, jb} in ({5, 6}, {16, 17}):
            e[crease] = 0.85
        elif ia == ib and {ja, jb} in ({4, 5}, {17, 18}):
            e[crease] = 0.4
for f in bm.faces:
    idx = [ring_of[v] for v in f.verts if v in ring_of]
    if len(idx) != 4: continue
    st = sum(i for i, _ in idx) / 4.0
    t = sum(ts[i] for i, _ in idx) / 4.0
    js = sorted(set(j for _, j in idx))
    seg = js[0] if len(js) == 2 and js[1] - js[0] == 1 else None
    if seg is None: continue
    # Dark under-body: the floor and sill everywhere, the whole lower flank
    # at the nose and tail, which reads as a splitter and a diffuser.
    ends = t < 0.08 or t > 0.9
    if seg in (0, 1, 21, 20) or (ends and seg in (2, 19)):
        f.material_index = 1
        continue
    side = (seg in (7, 8) or seg in (13, 14)) and 0.27 < t < 0.64
    screen = seg in (10, 11) and 0.58 < t < 0.70
    rear = seg in (10, 11) and 0.13 < t < 0.29
    if side or screen or rear: f.material_index = 2
for end in (0, -1):
    r = list(dict.fromkeys(rings[end]))
    r = [v for v in r if v.is_valid]
    if len(r) > 2:
        try: bm.faces.new(r)
        except ValueError: pass
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new('body'); bm.to_mesh(mesh); bm.free()
body = bpy.data.objects.new('body', mesh); scene.collection.objects.link(body)
for m in (M_PAINT, M_TRIM, M_GLASS): mesh.materials.append(m)
for p in mesh.polygons: p.use_smooth = True
sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.modifier_apply(modifier='sub')

# ---- wheel arches by boolean -------------------------------------------------
def cylinder(radius, depth, loc, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc,
                                        rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object
    o.data.materials.append(M_PAINT); o.data.materials.append(M_TRIM)
    for p in o.data.polygons: p.material_index = 1      # the well is dark
    return o

for sx in (-1, 1):
    for sy in (-1, 1):
        cutter = cylinder(TYRE_R + 0.075, 0.62, (sx * (WHEEL_X + 0.1), sy * WHEELZ, TYRE_R))
        # keep the cut a half-disc: nothing below the hub-line lip matters for the shell
        md = body.modifiers.new('arch', 'BOOLEAN'); md.object = cutter; md.operation = 'DIFFERENCE'
        md.solver = 'EXACT'
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier='arch')
        bpy.data.objects.remove(cutter, do_unlink=True)

# ---- glass: carve window faces out of the shell ------------------------------
bm = bmesh.new(); bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
# The flat end caps are one polygon each in the loft, so the lower part of the nose and
# tail would stay paint between the dark flank strips: darken it below the lamp line.
for f in bm.faces:
    c = f.calc_center_median()
    if abs(c.y) > 1.6 and c.z < 0.45 and f.material_index == 0: f.material_index = 1
glass_faces = [f for f in bm.faces if f.material_index == 2]
ng = bmesh.new()
vmap = {}
for f in glass_faces:
    vs = []
    for v in f.verts:
        if v.index not in vmap:
            vmap[v.index] = ng.verts.new(v.co + v.normal * 0.006)
        vs.append(vmap[v.index])
    try: ng.faces.new(vs)
    except ValueError: pass
bm.to_mesh(body.data); bm.free()
gm = bpy.data.meshes.new('glass'); ng.to_mesh(gm); ng.free()
glass = bpy.data.objects.new('glass', gm); scene.collection.objects.link(glass)
gm.materials.append(M_GLASS)
for p in gm.polygons: p.use_smooth = True

# ---- wheels ------------------------------------------------------------------
def spin(profile, material, segs=32):
    """Lathe a (axial, radial) profile about the X axis into a new bmesh piece."""
    b = bmesh.new(); vs = []
    for a, r in profile:
        vs.append([b.verts.new((a, r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs)))
                   for k in range(segs)])
    for i in range(len(vs) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            try: b.faces.new((vs[i][k], vs[i][k2], vs[i + 1][k2], vs[i + 1][k]))
            except ValueError: pass
    return b

def wheel_mesh(outboard):
    s = outboard
    out = bmesh.new(); mats = []
    def add(piece, mi):
        before = len(out.faces)
        m = bpy.data.meshes.new('p'); piece.to_mesh(m); piece.free()
        out.from_mesh(m); bpy.data.meshes.remove(m)
        out.faces.ensure_lookup_table()
        for f in out.faces[before:]: f.material_index = mi
    hw = TYRE_W / 2
    tyre = [(-hw*.98, .215), (-hw*1.0, .25), (-hw*.88, .29), (-hw*.55, .314), (hw*.55, .314), (hw*.88, .29),
            (hw*1.0, .25), (hw*.98, .215), (hw*.82, .205), (-hw*.82, .205), (-hw*.98, .215)]
    add(spin(tyre, 0), 0)
    rim = [(hw*.82, .205), (hw*.9, .212), (hw*.84, .2), (hw*.45, .196), (hw*.2, .09), (hw*.14, .05), (hw*.14, 0.0)]
    add(spin(rim, 1), 1)
    # five twin spokes from the hub to the lip, slightly proud of the dish
    for k in range(5):
        for off in (-0.11, 0.11):
            a = 2 * math.pi * k / 5 + 0.3 + off
            pb = bmesh.new()
            def v(ax, r, w):
                return pb.verts.new((ax, r * math.cos(a) - w * math.sin(a), r * math.sin(a) + w * math.cos(a)))
            o = [v(hw*.80, 0.07, 0.02), v(hw*.80, 0.07, -0.02), v(hw*.86, 0.2, -0.011), v(hw*.86, 0.2, 0.011)]
            i = [v(hw*.45, 0.07, 0.02), v(hw*.45, 0.07, -0.02), v(hw*.5, 0.2, -0.011), v(hw*.5, 0.2, 0.011)]
            for f in ((o[0], o[1], o[2], o[3]), (o[0], o[3], i[3], i[0]), (o[1], i[1], i[2], o[2]),
                      (o[3], o[2], i[2], i[3]), (o[0], i[0], i[1], o[1])):
                try: pb.faces.new(f)
                except ValueError: pass
            add(pb, 1)
    # centre cap and five lug nuts
    add(spin([(hw*.8, 0.0), (hw*.9, 0.035), (hw*.9, 0.075), (hw*.8, 0.08)], 1, 16), 1)
    for k in range(5):
        a = 2 * math.pi * k / 5
        nb = bmesh.new()
        bmesh.ops.create_cone(nb, cap_ends=True, segments=6, radius1=0.014, radius2=0.012, depth=0.016)
        bmesh.ops.rotate(nb, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=nb.verts)
        bmesh.ops.translate(nb, vec=(hw*.92, 0.055 * math.cos(a), 0.055 * math.sin(a)), verts=nb.verts)
        add(nb, 2)
    # brake disc behind the spokes, and a caliper
    add(spin([(-hw*.25, .0), (-hw*.25, .19), (-hw*.1, .19), (-hw*.1, .0)], 2), 2)
    cb = bmesh.new()
    bmesh.ops.create_cube(cb, size=1.0)
    bmesh.ops.scale(cb, vec=(0.07, 0.1, 0.07), verts=cb.verts)
    bmesh.ops.translate(cb, vec=(-hw*.3, 0.0, 0.15), verts=cb.verts)
    add(cb, 3)
    for v_ in out.verts: v_.co.x *= s
    if s < 0: bmesh.ops.reverse_faces(out, faces=out.faces)
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    m = bpy.data.meshes.new('wheel'); out.to_mesh(m); out.free()
    for mt in (M_TYRE, M_RIM, M_DISC, M_CALIPER): m.materials.append(mt)
    for p in m.polygons: p.use_smooth = (p.material_index in (0, 1))
    return m

wheels = []
for name, sx, sy in (('wheel_fl', -1, -1), ('wheel_fr', 1, -1), ('wheel_rl', -1, 1), ('wheel_rr', 1, 1)):
    o = bpy.data.objects.new(name, wheel_mesh(sx)); scene.collection.objects.link(o)
    o.location = (sx * WHEEL_X, sy * WHEELZ, TYRE_R); wheels.append(o)

# ---- fittings, placed by ray-casting onto the finished shell -------------------
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
def hit(origin, direction):
    ok, loc, nrm, *_ = scene.ray_cast(dg, Vector(origin), Vector(direction))
    if ok and nrm.dot(Vector(direction)) > 0: nrm = -nrm       # always face the ray's origin
    return (loc, nrm) if ok else (None, None)

def blob(name, size, loc, nrm, material, sink=0.35, shape='sphere'):
    if shape == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2)
    o = bpy.context.active_object; o.name = name
    o.scale = size
    z = nrm.normalized()
    q = z.to_track_quat('Z', 'Y'); o.rotation_euler = q.to_euler()
    o.location = loc - z * size[2] * sink * 1.0
    o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o

fit = []
def seam(name, pts, direction, width=0.007, lift=0.0015):
    """A thin dark ribbon laid on the shell along a polyline: a panel shut line.
    Each point is ray-cast along `direction` so the ribbon follows the surface."""
    hits = []
    for p_ in pts:
        loc, n = hit(p_, direction)
        if loc: hits.append((loc, n))
    if len(hits) < 2: return None
    bmx = bmesh.new(); row = []
    for i, (loc, n) in enumerate(hits):
        a_ = hits[min(i + 1, len(hits) - 1)][0] - hits[max(i - 1, 0)][0]
        side = a_.cross(n).normalized() * (width / 2)
        row.append((bmx.verts.new(loc + n * lift + side), bmx.verts.new(loc + n * lift - side)))
    for (a0, b0), (a1, b1) in zip(row, row[1:]):
        bmx.faces.new((a0, a1, b1, b0))
    bmesh.ops.recalc_face_normals(bmx, faces=bmx.faces)
    m = bpy.data.meshes.new(name); bmx.to_mesh(m); bmx.free()
    m.materials.append(M_TRIM)
    o = bpy.data.objects.new(name, m); scene.collection.objects.link(o)
    return o

fit = []
for s in (-1, 1):
    # headlamps: low on the nose, swept back toward the wing
    loc, n = hit((s * 0.62, -3.0, 0.50), (0, 1, 0))
    if loc: fit.append(blob('bezel_h' + str(s), (0.215, 0.058, 0.03), loc, n, M_TRIM, sink=0.75))
    if loc: fit.append(blob('lamp_head_l' if s < 0 else 'lamp_head_r', (0.19, 0.045, 0.035), loc, n, M_HEAD, sink=0.6))
    loc, n = hit((s * 0.42, 3.0, 0.78), (0, -1, 0))
    if loc: fit.append(blob('bezel_t' + str(s), (0.23, 0.056, 0.04), loc, n, M_TRIM, sink=0.75))
    if loc: fit.append(blob('lamp_tail_l' if s < 0 else 'lamp_tail_r', (0.2, 0.04, 0.045), loc, n, M_TAIL, sink=0.6))
    loc, n = hit((s * 2.0, -0.55, 0.95), (-s, 0, 0))
    if loc:
        mr = blob('mirror_l' if s < 0 else 'mirror_r', (0.11, 0.07, 0.06), loc, n, M_TRIM, sink=-0.8)
        fit.append(mr)
def box(name, size, loc, material, rot=(0, 0, 0)):
    """A flat-shaded box centred on `loc`; `size` is the full extent in x, y, z."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = size; o.location = loc; o.rotation_euler = rot
    o.data.materials.append(material)
    return o

# ---- nose: grille opening with slats, corner intakes, splitter lip, hood bulge and vents -------
loc, n = hit((0, -3.0, 0.36), (0, 1, 0))
if loc:
    fit.append(blob('grille', (0.46, 0.05, 0.085), loc, n, M_TRIM, sink=0.7))
    for k in range(3):          # three bars across the opening, each laid on the shell
        bl, bn = hit((0, -3.0, 0.315 + 0.045 * k), (0, 1, 0))
        if bl: fit.append(blob('grille_bar', (0.36, 0.02, 0.009), bl, bn, M_DISC, sink=0.2))
for s in (-1, 1):               # small corner intakes either side of the grille
    loc, n = hit((s * 0.60, -3.0, 0.30), (0, 1, 0))
    if loc: fit.append(blob('intake_' + str(s), (0.12, 0.035, 0.05), loc, n, M_TRIM, sink=0.7))
loc, n = hit((0, -3.0, 0.20), (0, 1, 0))
if loc:                         # the splitter: a thin blade under the nose, proud of the bumper
    fit.append(box('splitter', (1.34, 0.17, 0.014), (0, loc.y - 0.05, CLEAR + 0.012), M_TRIM))
loc, n = hit((0, -1.25, 2.0), (0, 0, -1))
if loc:                         # a low power bulge, painted so it repaints with the car
    bulge = blob('hood_bulge', (0.17, 0.36, 0.035), loc, n, M_PAINT, sink=0.5)
for s in (-1, 1):               # twin vent slits either side of it
    loc, n = hit((s * 0.34, -1.30, 2.0), (0, 0, -1))
    if loc: fit.append(blob('hood_vent_' + str(s), (0.035, 0.17, 0.01), loc, n, M_TRIM, sink=0.4))

# ---- tail: lamp bar, plate recess, diffuser, exhaust tips ---------------------------------
loc, n = hit((0, 3.0, 0.72), (0, -1, 0))
if loc: fit.append(blob('tail_bar', (0.28, 0.02, 0.015), loc, n, M_TAIL, sink=0.6))
loc, n = hit((0, 3.0, 0.53), (0, -1, 0))
if loc:                         # a blank, unmarked plate in a dark surround
    fit.append(blob('plate_recess', (0.27, 0.02, 0.085), loc, n, M_TRIM, sink=0.3, shape='cube'))
    fit.append(blob('plate', (0.235, 0.02, 0.06), loc + n * 0.012, n, M_PLATE, sink=0.3, shape='cube'))
loc, n = hit((0, 3.0, 0.24), (0, -1, 0))
if loc:                         # diffuser: a dark floor blade with fins
    fit.append(box('diffuser', (1.06, 0.2, 0.012), (0, loc.y - 0.04, CLEAR + 0.02), M_TRIM))
    for k in range(-3, 4):
        fit.append(box('diffuser_fin', (0.012, 0.19, 0.05), (k * 0.15, loc.y - 0.04, CLEAR + 0.045), M_TRIM))
for s in (-1, 1):               # round exhaust tips: a chrome ring around a dark bore
    loc, n = hit((s * 0.42, 3.0, 0.36), (0, -1, 0))
    if loc:
        for nm, r, d, mt, off in (('exhaust_' + ('l' if s < 0 else 'r'), 0.052, 0.12, M_CHROME, 0.0),
                                  ('exhaust_bore', 0.036, 0.125, M_TRIM, 0.004)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=r, depth=d,
                                                location=(loc.x, loc.y + 0.03 + off, loc.z), rotation=(math.pi / 2, 0, 0))
            o = bpy.context.active_object; o.name = nm
            o.data.materials.append(mt)
            for p_ in o.data.polygons: p_.use_smooth = True
            fit.append(o)

# ---- spoiler blade: a thin lip across the rear deck -------------------------------
loc, n = hit((0, 1.66, 2.0), (0, 0, -1))
if loc:
    bpy.ops.mesh.primitive_cube_add(size=2)
    sp = bpy.context.active_object; sp.name = 'spoiler'
    sp.scale = (0.54, 0.07, 0.012)
    sp.rotation_euler = (math.atan2(-n.y, n.z) + 0.05, 0, 0)
    sp.location = loc + Vector((0, 0.0, 0.006))
    sp.data.materials.append(M_TRIM)
    for p_ in sp.data.polygons: p_.use_smooth = False
    fit.append(sp)

# ---- shut lines: hood, doors, boot -------------------------------------------------
def line(a, b, k=40):
    return [tuple(a[i] + (b[i] - a[i]) * j / (k - 1) for i in range(3)) for j in range(k)]
DOWN = (0, 0, -1)
for sd in (-1, 1):
    fit += [o for o in (
        seam('seam_hood_side', line((sd * 0.62, -2.55, 2.0), (sd * 0.62, -0.72, 2.0)), DOWN),
        seam('seam_door_f', line((sd * 2.0, -0.52, 0.36), (sd * 2.0, -0.52, 0.80)), (-sd, 0, 0), 0.006),
        seam('seam_door_r', line((sd * 2.0, 0.70, 0.36), (sd * 2.0, 0.70, 0.80)), (-sd, 0, 0), 0.006),
        seam('seam_boot_side', line((sd * 0.60, 1.62, 2.0), (sd * 0.60, 2.9, 2.0), 20), DOWN, 0.006),
    ) if o]
fit += [o for o in (
    seam('seam_hood_rear', line((-0.62, -0.74, 2.0), (0.62, -0.74, 2.0)), DOWN),
    seam('seam_hood_front', line((-0.62, -2.55, 2.0), (0.62, -2.55, 2.0), 24), DOWN, 0.006),
    seam('seam_boot', line((-0.60, 1.62, 2.0), (0.60, 1.62, 2.0)), DOWN, 0.006),
) if o]

# ---- the bulge joins the body: the loader repaints only the `a_body` mesh, so a separate
# painted part would keep the model's colour on every car.
if 'bulge' in globals():
    bpy.ops.object.select_all(action='DESELECT')
    bulge.select_set(True); body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()

# ---- export ---------------------------------------------------------------------
body.name = 'a_body'; glass.name = 'b_glass'
root = bpy.data.objects.new('kestrel', None); scene.collection.objects.link(root)
for o in [body, glass] + wheels + fit: o.parent = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print('tris', sum(len(o.data.polygons) for o in [body, glass] + wheels + fit))

# ---- preview ----------------------------------------------------------------------
if PREVIEW:
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    scene.world = w
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(mat('road', (0.05, 0.05, 0.055, 1), 0, 0.9))
    for e, rot in ((3.0, (0.9, 0.2, 0.7)), (1.2, (1.1, 0, -2.2))):
        l = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); l.data.energy = e
        l.rotation_euler = rot; scene.collection.objects.link(l)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.render.engine = 'BLENDER_EEVEE'
    ctr = Vector((0, 0, 0.6))
    for name, off, lens in (('front34', (4.2, -4.6, 1.8), 45), ('side', (6.5, 0, 0.9), 45), ('rear34', (-4.2, 4.6, 1.8), 45),
                            ('front', (0, -7, 1.0), 55), ('chase', (-1.5, 8.5, 3.2), 50)):
        cam.data.lens = lens; cam.location = ctr + Vector(off)
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{PREVIEW}_{name}.png'
        bpy.ops.render.render(write_still=True)
