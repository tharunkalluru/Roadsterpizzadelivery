"""Diagnostic only: actual Roadster-game auto handlebar dimensions in native
actor coordinates. Does not modify/export the actor; not gameplay evidence.
"""
import bpy,math,runpy
from mathutils import Vector
material=bpy.data.materials.new('Diagnostic actual auto handlebar');material.diffuse_color=(.04,.04,.04,1)
for x,r,length in [(0,.0175,.57),(-.22,.023,.12),(.22,.023,.12)]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=length,location=(x,-.44,.83),rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='DIAGNOSTIC actual auto control grip';o.data.materials.append(material)
runpy.run_path(str(__import__('pathlib').Path(__file__).with_name('render_character.py')),run_name='__main__')
