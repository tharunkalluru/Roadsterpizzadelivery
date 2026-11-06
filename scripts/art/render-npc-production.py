"""CPU-only structural review of exported actual production NPC geometry.

Use with Blender --background --factory-startup --threads 2 --python THIS -- DIR.
The source positions, split normals, and vertex colours are unmodified.
"""
import bpy, json, math, os, sys
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
root=args[0]
for view in args[1:] or ('front','profile','faces','seated','seated-side','seated-quarter'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data=json.load(open(os.path.join(root,view+'.json')))
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=12
    scene.render.threads_mode='FIXED'; scene.render.threads=2
    scene.render.resolution_x=1600; scene.render.resolution_y=900; scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Neutral daylight'); scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.63,.67,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    mat=bpy.data.materials.new('Exact game vehicle-material settings'); mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value=data.get('roughness',.42); shader.inputs['Metallic'].default_value=data.get('metalness',.18)
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name='productionColor'; mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color'])
    for o in data['objects']:
        p=o['position']; n=o['normal']; c=o['color']; count=len(p)//3
        # Three uses Y-up; transform its coordinates to Blender Z-up.
        verts=[(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)]
        mesh=bpy.data.meshes.new(o['name']); mesh.from_pydata(verts,[],[(i,i+1,i+2) for i in range(0,count,3)]); mesh.update()
        normals=[(n[i],-n[i+2],n[i+1]) for i in range(0,len(n),3)]
        for poly in mesh.polygons: poly.use_smooth=True
        mesh.normals_split_custom_set(normals)
        colors=mesh.color_attributes.new(name='productionColor',type='FLOAT_COLOR',domain='CORNER')
        for i,v in enumerate(colors.data): v.color=(c[i*3],c[i*3+1],c[i*3+2],1)
        obj=bpy.data.objects.new(o['name'],mesh); scene.collection.objects.link(obj); obj.data.materials.append(mat)
    def light(name,position,power,size):
        d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size
        o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=position; o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
    light('Key',(-3, -4, 6),450,5); light('Fill',(4,1,4),180,4)
    cam=bpy.data.cameras.new('Production fixture framing'); camera=bpy.data.objects.new('Camera',cam); scene.collection.objects.link(camera)
    # Three front camera is on negative Z, which is positive Y in Blender.
    source_camera=data.get('camera',[0,data['targetY'],-10]); camera.location=(source_camera[0],-source_camera[2],source_camera[1])
    camera.rotation_euler=(Vector((0,-data.get('targetZ',0),data['targetY']))-camera.location).to_track_quat('-Z','Y').to_euler()
    cam.type='ORTHO'; cam.ortho_scale=max(data['width'],data['height']*1600/900); scene.camera=camera
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [i.name for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    scene.render.image_settings.file_format='PNG'; scene.render.filepath=os.path.join(root,view+'.png'); bpy.ops.render.render(write_still=True)
print('Saved production geometry review views:',root)
