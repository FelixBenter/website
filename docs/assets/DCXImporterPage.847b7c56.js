import{Q as i,a as o}from"./index.esm.7420b775.js";import{Q as s}from"./QPage.d83ce4b9.js";import{_ as d,m as l,q as _,s as m,t as p,u as f,z as e,v as a,X as r}from"./index.47c864f7.js";import"./QBtn.ace210e5.js";import"./dom.cf56c019.js";import"./position-engine.25adee15.js";import"./selection.3861cc93.js";import"./scroll.95183e25.js";const c=l({name:"PhysarumPage",components:{QMarkdown:i},data(){return{split:60,markdown:`\`\`\`
def transform_bone_and_siblings(bone_index, parent_matrix):
  while bone_index != -1:
      flver_bone = flver_data.bones[bone_index]
      bone = armature.data.edit_bones[bone_index]
      if flver_bone.parent_index >= 0:
          bone.parent = armature.data.edit_bones[flver_bone.parent_index]

      translation_vector = Vector(
          (flver_bone.translation[0], flver_bone.translation[1],
            flver_bone.translation[2]))
      rotation_matrix = (
          Matrix.Rotation(flver_bone.rotation[1], 4, 'Y')
          @ Matrix.Rotation(flver_bone.rotation[2], 4, 'Z')
          @ Matrix.Rotation(flver_bone.rotation[0], 4, 'X'))

      head = parent_matrix @ translation_vector
      tail = head + rotation_matrix @ Vector((0, 0.05, 0))

      bone.head = (head[0], head[2], head[1])
      bone.tail = (tail[0], tail[2], tail[1])

      # Transform children and advance to next sibling
      transform_bone_and_siblings(
          flver_bone.child_index, parent_matrix
          @ Matrix.Translation(translation_vector) @ rotation_matrix)
      bone_index = flver_bone.next_sibling_index

transform_bone_and_siblings(0, Matrix())
\`\`\``}}}),h={class:"q-mt-none q-mb-lg text-primary"},u=e("div",{class:"text-h4"},"Blender DCX Importer",-1),x=e("br",null,null,-1),b=e("p",null," An add-on for the 3D modelling program Blender to import proprietary model and texture files from FromSoftware video games. The tool unpacks the input files and loads mesh data, armature data and finds the appropriate texture data for that model. It then loads these items into Blender and applies the armature and texture data into a rigged and textured blender model. ",-1),v=e("p",null," Blender supports an extensive python API for automating any user function in the program. The add-on, using several other tools, decompresses the proprietary .dcx files. ",-1),g=e("p",null," From this .dcx file we get a .flver (model, UV and rigging data) and a .tpf file (texture data). The .flver model data is read into memory and the model is created in blender from the vertex buffer and armature data. The .tpf is unpacked and the textures within are converted from .dds to .png using the DirectXTex texture converter. ",-1),w=e("p",null," Finally, Blender materials are created from these textures and applied to the model. ",-1),y=e("div",{class:"text-caption"}," Excerpt from the armature creation code: Creates, positions and links bones for the model's armature from the flver data. ",-1);function k(t,B,C,q,T,I){const n=f("q-markdown");return _(),m(s,null,{default:p(()=>[e("div",h,[u,x,a(o,{src:"portfolio/dcximporter_gif_0.gif",class:r(t.$q.platform.is.mobile?"":"aside")},null,8,["class"]),b,v,a(o,{src:"portfolio/dcximporter_img_1.png",class:r(t.$q.platform.is.mobile?"":"aside")},null,8,["class"]),g,w,a(n,{style:{"line-height":"1.5",overflow:"auto","overflow-x":"auto","min-width":"0px","box-sizing":"border-box"},src:t.markdown,class:"focused"},null,8,["src"]),y])]),_:1})}var F=d(c,[["render",k]]);export{F as default};
