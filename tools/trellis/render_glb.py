"""Render a TRELLIS .glb from a chase-camera angle and a close three-quarter.

  blender -b -P tools/trellis/render_glb.py -- CAR.glb OUT_PREFIX
Writes OUT_PREFIX_chase.png (behind, above, far, like the game's chase camera)
and OUT_PREFIX_close.png. Judge in the chase view, not the close one.
"""
import bpy, sys, math, mathutils
glb, pre = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)])
hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr, size = (lo + hi) / 2, max(hi - lo)
w = bpy.data.worlds.new('w'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
bpy.context.scene.world = w
for loc, e in (((4, -4, 6), 4), ((-5, 4, 3), 1.5)):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN')); l.data.energy = e
    l.rotation_euler = (math.radians(50), 0, math.radians(35)); bpy.context.scene.collection.objects.link(l)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
def shot(offset, name, lens):
    cam.data.lens = lens
    cam.location = ctr + offset * size
    d = ctr - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{pre}_{name}.png'; bpy.ops.render.render(write_still=True)
# glb is Y-up in file, Blender imports Z-up with the car's nose on -Y or +Y; shoot from both ends.
shot(mathutils.Vector((0, -3.2, 1.0)), 'chase', 50)
shot(mathutils.Vector((0, 3.2, 1.0)), 'chase_other', 50)
shot(mathutils.Vector((1.2, -1.2, 0.5)), 'close', 50)
