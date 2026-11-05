"""Create an OFFLINE review scene with the game's prop dimensions.
Does not export props into the actor GLB; runtime owns those objects.
"""
import argparse,sys,math
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
if a.output.exists():raise RuntimeError('Preserve previous review scenes')
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
black=mat('Review actual phone material',(.025,.025,.03));brown=mat('Review bottle glass',(.24,.10,.035));gold=mat('Review bottle cap',(.7,.48,.16));xray=mat('Review Xray film',(.04,.08,.11))
def box(anchor,scale,color):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name='OFFLINE_REVIEW_PROP';o.parent=anchor;o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(color)
if (anchor:=bpy.data.objects.get('PropPhone')):box(anchor,(.055,.15,.025),black)
if (anchor:=bpy.data.objects.get('PropXray')):box(anchor,(.35,.48,.015),xray)
if (anchor:=bpy.data.objects.get('PropBottle')):
 for radius,depth,y,color in [(.045,.22,.11,brown),(.025,.07,.255,gold)]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=radius,depth=depth);o=bpy.context.object;o.name='OFFLINE_REVIEW_PROP';o.parent=anchor;o.location=(0,0,y);o.rotation_euler=(0,0,0);o.data.materials.append(color)
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.resolve()))
