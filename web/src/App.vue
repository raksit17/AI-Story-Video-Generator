<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storyApi } from './services/story-api'

type Scene = { id:string; title:string; narration:string; imagePrompt:string; duration:number; image:string; imageUrl?:string; motion:string }
type Character = { name:string; look:string; reference:string }
type Project = { storyId?:string; title:string; prompt:string; genre:string; language:string; ratio:string; scenes:Scene[]; character:Character; voice:string; metadata:{title:string; description:string; tags:string}; thumbnail:string }
const blank = ():Project => ({title:'เรื่องใหม่',prompt:'',genre:'Anime Fantasy',language:'ไทย',ratio:'9:16',scenes:[],character:{name:'',look:'',reference:''},voice:'',metadata:{title:'',description:'',tags:''},thumbnail:''})
const saved = localStorage.getItem('storyframe-project-v1')
const project = ref<Project>(saved ? JSON.parse(saved) : blank())
const activePhase=ref(1), selected=ref(0), busy=ref(false), toast=ref('')
const generatingSceneId=ref<string|null>(null)
const imageError=ref('')
const imageProgress=ref('')
const imageSeconds=ref(0)
const current = computed(()=>project.value.scenes[selected.value])
watch(project, v=>localStorage.setItem('storyframe-project-v1',JSON.stringify(v)),{deep:true})
function notify(s:string){toast.value=s; setTimeout(()=>toast.value='',2600)}
function scene(title:string,narration:string,prompt:string,duration=7):Scene{return{id:crypto.randomUUID(),title,narration,imagePrompt:prompt,duration,image:'',motion:'ซูมเข้า'}}
function draftStory(){
 if(!project.value.prompt.trim()){notify('ใส่แนวคิดเรื่องก่อนเริ่มสร้าง');return}
 const seed=project.value.prompt.trim()
 project.value.storyId=undefined
 project.value.title=seed.length>34?seed.slice(0,34)+'…':seed
 project.value.scenes=[
  scene('จุดเริ่มต้น',`เรื่องเริ่มต้นขึ้นเมื่อ ${seed} ตัวเอกยังไม่รู้ว่าการตัดสินใจครั้งนี้จะเปลี่ยนทุกอย่าง`,`${project.value.genre}, establishing shot, main character introduced, cinematic composition`),
  scene('เงื่อนงำ',`ระหว่างทาง ตัวเอกพบสัญญาณลึกลับที่เชื่อมโยงกับอดีต`,`${project.value.genre}, mysterious discovery, expressive character, dramatic light`),
  scene('บททดสอบ',`อุปสรรคครั้งใหญ่บีบให้เธอต้องเลือกว่าจะยอมแพ้ หรือก้าวต่อไป`,`${project.value.genre}, emotional confrontation, dynamic framing, detailed background`),
  scene('พลังตื่นขึ้น',`เมื่อยอมรับตัวตนที่แท้จริง พลังใหม่ก็ปรากฏขึ้น`,`${project.value.genre}, magical transformation, glowing particles, cinematic anime`),
  scene('บทสรุป',`การเดินทางยังไม่จบ แต่ครั้งนี้เธอพร้อมกำหนดชะตาของตัวเอง`,`${project.value.genre}, hopeful finale, sunrise, heroic wide shot`)
 ]; selected.value=0; notify('สร้างโครงเรื่องตัวอย่างแล้ว — แก้ไขแต่ละฉากหรือเชื่อม AI เพื่อสร้างฉบับเต็ม')
}
function addScene(){project.value.scenes.push(scene('ฉากใหม่','','',7));selected.value=project.value.scenes.length-1}
function move(i:number,d:number){const j=i+d;if(j<0||j>=project.value.scenes.length)return;const a=project.value.scenes.splice(i,1)[0];project.value.scenes.splice(j,0,a);selected.value=j}
function fileData(e:Event, cb:(s:string)=>void){const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>cb(String(reader.result));reader.readAsDataURL(file)}
function addImage(e:Event){const target=current.value;if(target)fileData(e,s=>{target.image=s;target.imageUrl=undefined})}
function addCharacter(e:Event){fileData(e,s=>project.value.character.reference=s)}
function addThumb(e:Event){fileData(e,s=>project.value.thumbnail=s)}
function exportProject(){const blob=new Blob([JSON.stringify(project.value,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='story-project.json';a.click();URL.revokeObjectURL(a.href)}
function importProject(e:Event){fileData(e,()=>{});const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;file.text().then(t=>{try{project.value=JSON.parse(t);selected.value=0;notify('นำเข้าโปรเจกต์แล้ว')}catch{notify('ไฟล์โปรเจกต์ไม่ถูกต้อง')}})}
async function generateStoryboard(){busy.value=true;try{const r=await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/stories/storyboard`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:project.value.prompt,genre:project.value.genre,language:project.value.language,aspect:project.value.ratio})});if(!r.ok)throw Error();const data=await r.json();if(data.scenes?.length){project.value.storyId=undefined;project.value.scenes=data.scenes.map((s:any)=>({...s,id:s.id||crypto.randomUUID(),image:s.image||'',motion:s.motion||'ซูมเข้า'}));}notify('สร้างสตอรี่บอร์ดสำเร็จ')}catch{draftStory()}finally{busy.value=false}}

async function waitForSceneImage(storyId:string,sceneId:string):Promise<void>{
  const started=Date.now()
  // The API returns immediately while ComfyUI works; poll for completion.
  for(let attempt=0;attempt<460;attempt++){
    const result=await storyApi.getSceneImageStatus(storyId,sceneId)
    imageSeconds.value=Math.floor((Date.now()-started)/1000)
    if(result.status==='completed'){
      if(!result.url)throw new Error('Backend reported success without an image URL')
      const scene=project.value.scenes.find(s=>s.id===sceneId)
      if(scene){scene.imageUrl=result.url;scene.image=result.url}
      imageProgress.value='สร้างภาพและบันทึกเรียบร้อย'
      notify('สร้างภาพ AI สำเร็จ')
      return
    }
    if(result.status==='failed')throw new Error(result.error||'ComfyUI สร้างภาพไม่สำเร็จ')
    if(result.status==='idle'){
      imageProgress.value='รอตรวจสอบงานเดิมใน ComfyUI'
    }else{
      imageProgress.value=result.status==='running'
        ? 'ComfyUI กำลังสร้างภาพ'
        : 'รอคิว ComfyUI หรือรอผลการประมวลผล'
    }
    await new Promise(resolve=>setTimeout(resolve,2000))
  }
  throw new Error('หมดเวลาติดตามงาน กรุณาตรวจสอบ ComfyUI History')
}

async function resumeSceneImage(){
  const storyId=project.value.storyId
  const target=current.value
  if(!storyId||!target||generatingSceneId.value!==null)return
  // Also recovers PNGs left by the previous synchronous API implementation.
  if(target.imageUrl){
    if(!target.image)target.image=target.imageUrl
    return
  }
  try{
    const result=await storyApi.getSceneImageStatus(storyId,target.id)
    if(result.status==='completed'&&result.url){
      target.imageUrl=result.url
      target.image=result.url
      notify('กู้ภาพจาก ComfyUI สำเร็จ')
    }else if(result.status==='running'||result.status==='queued'){
      generatingSceneId.value=target.id
      imageError.value=''
      imageProgress.value='กำลังกู้สถานะงาน ComfyUI'
      try{await waitForSceneImage(storyId,target.id)}
      catch(error){imageError.value=error instanceof Error?error.message:'ติดตามงานไม่สำเร็จ'}
      finally{generatingSceneId.value=null}
    }
  }catch{
    // Do not disrupt offline storyboard editing when the API is unavailable.
  }
}

onMounted(()=>{void resumeSceneImage()})
watch(selected,()=>{void resumeSceneImage()})

async function generateSceneImage(){
  const target=current.value
  if(!target||generatingSceneId.value!==null)return
  if(!target.imagePrompt.trim()){imageError.value='กรุณาใส่ Prompt สำหรับภาพก่อน';return}
  generatingSceneId.value=target.id
  imageError.value=''
  imageProgress.value='กำลังบันทึก Story ลง Backend'
  imageSeconds.value=0
  try{
    const payload={
      title:project.value.title,
      prompt:project.value.prompt,
      genre:project.value.genre,
      language:project.value.language,
      aspect:project.value.ratio,
      characters:(project.value.character.name||project.value.character.look)
        ? [{name:project.value.character.name,description:project.value.character.look,appearance:project.value.character.look}]
        : [],
      scenes:project.value.scenes.map(scene=>({
        id:scene.id,title:scene.title,narration:scene.narration,
        imagePrompt:scene.imagePrompt,duration:scene.duration,
        motion:scene.motion,imageUrl:scene.imageUrl,
      })),
    }
    const storyId=await storyApi.saveStory(payload,project.value.storyId)
    project.value.storyId=storyId
    imageProgress.value='กำลังส่งงานไป ComfyUI'
    await storyApi.startSceneImage(storyId,target.id)
    await waitForSceneImage(storyId,target.id)
  }catch(error){
    imageError.value=error instanceof Error?error.message:'ไม่สามารถสร้างภาพ AI ได้'
    notify('สร้างภาพ AI ไม่สำเร็จ')
  }finally{
    generatingSceneId.value=null
  }
}
</script>

<template>
 <div class="app-shell">
  <aside class="sidebar"><div class="brand"><div class="brand-mark">✳</div><div><b>STORYFRAME</b><small>AI STORY STUDIO</small></div></div><div class="side-label">WORKSPACE</div><button class="nav active">▧ <span>โปรเจกต์ของฉัน</span></button><button class="nav" @click="notify('เลือกโปรเจกต์จากรายการล่าสุด')">◷ <span>ทำล่าสุด</span></button><div class="side-bottom"><div class="mini-avatar">SF</div><div><b>Local project</b><small>บันทึกในเครื่องนี้</small></div><button class="icon-btn" title="ส่งออกโปรเจกต์" @click="exportProject">⇩</button></div></aside>
  <main class="main"><header class="topbar"><div class="crumb">โปรเจกต์ <span>/</span> {{project.title}}</div><div class="top-actions"><label class="button quiet">นำเข้า JSON<input hidden type="file" accept="application/json" @change="importProject"></label><button class="button primary" @click="exportProject">ส่งออกโปรเจกต์ <span>↗</span></button></div></header>
   <section class="hero"><div><div class="eyebrow"><span class="pulse"></span> AI STORY VIDEO GENERATOR</div><h1>เปลี่ยนไอเดียให้เป็น<br><em>เรื่องราวที่มองเห็นได้</em></h1><p>เริ่มจาก Prompt เดียว วางฉาก สร้างภาพ แล้วเตรียมวิดีโอสำหรับ YouTube</p></div><div class="hero-art"><div class="orb orb-a"></div><div class="orb orb-b"></div><div class="art-card"><span>STORY</span><b>01 — 05</b><small>SCENES IN FRAME</small></div></div></section>
   <div class="phase-strip"><button v-for="n in 4" :key="n" :class="['phase-pill',{chosen:activePhase===n,done:n<activePhase}]" @click="activePhase=n"><span class="phase-num">{{n<activePhase?'✓':'0'+n}}</span><span><b>{{['สร้างเรื่องและภาพ','เสียงและวิดีโอ','ตัวละครคงที่','เตรียมลง YouTube'][n-1]}}</b><small>{{['STORYBOARD','VOICE & VIDEO','CHARACTER','PUBLISH'][n-1]}}</small></span><span v-if="n<4" class="phase-arrow">→</span></button></div>
   <section v-if="activePhase===1" class="content-grid"><div class="left-col"><div class="panel prompt-panel"><div class="panel-head"><div><span class="step-tag">PHASE 01 / STORY</span><h2>เล่าไอเดียของคุณ</h2></div><span class="spark">✦</span></div><textarea v-model="project.prompt" placeholder="ตัวอย่าง: เด็กสาวนักเวทถูกขับไล่ออกจากอาณาจักร ก่อนจะค้นพบว่าตัวเองมีพลังของจอมมาร…"></textarea><div class="settings-row"><label>แนวเรื่อง<select v-model="project.genre"><option>Anime Fantasy</option><option>นิทานผจญภัย</option><option>ไซไฟ</option><option>ดราม่า</option><option>สารคดี</option></select></label><label>ภาษา<select v-model="project.language"><option>ไทย</option><option>English</option></select></label><label>สัดส่วน<select v-model="project.ratio"><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div><button class="button primary generate" :disabled="busy" @click="generateStoryboard">✦ {{busy?'กำลังสร้าง…':'สร้างสตอรี่บอร์ด'}} <span>→</span></button><div class="hint">ระบบจะร่างเรื่องและแบ่งเป็นฉากให้คุณตรวจทานก่อนสร้างภาพ</div></div>
    <div class="panel scenes-panel"><div class="panel-head"><div><span class="step-tag">YOUR STORY</span><h2>สตอรี่บอร์ด <span class="count">{{project.scenes.length}} ฉาก</span></h2></div><button class="text-btn" @click="addScene">＋ เพิ่มฉาก</button></div><div v-if="!project.scenes.length" class="empty-state"><div class="empty-icon">▧</div><b>เรื่องราวของคุณจะเริ่มตรงนี้</b><span>ใส่ Prompt แล้วกดสร้างสตอรี่บอร์ด</span></div><div v-else class="scene-list"><button v-for="(s,i) in project.scenes" :key="s.id" :class="['scene-row',{selected:selected===i}]" @click="selected=i"><span class="scene-index">{{String(i+1).padStart(2,'0')}}</span><span class="scene-thumb" :style="(s.image||s.imageUrl)?{backgroundImage:`url(${s.image||s.imageUrl})`}:{}">{{(s.image||s.imageUrl)?'':'✦'}}</span><span class="scene-copy"><b>{{s.title||'ฉากใหม่'}}</b><small>{{s.narration||'เพิ่มบทบรรยายของฉากนี้'}}</small></span><span class="duration">{{s.duration}}s</span><span class="reorder"><i @click.stop="move(i,-1)">↑</i><i @click.stop="move(i,1)">↓</i></span></button></div></div></div>
    <div class="right-col"><div class="panel preview-panel"><div class="panel-head"><div><span class="step-tag">SCENE PREVIEW</span><h2>ภาพของฉาก</h2></div><button class="icon-btn" @click="notify('เลือกภาพที่ต้องการใช้กับฉากนี้')">···</button></div><div class="preview-frame" :class="project.ratio==='16:9'?'wide':''" :style="(current?.image||current?.imageUrl)?{backgroundImage:`url(${current.image||current.imageUrl})`}:{}"><template v-if="!(current?.image||current?.imageUrl)"><div class="preview-glow"></div><div class="mountain m1"></div><div class="mountain m2"></div><div class="preview-caption"><span>SCENE {{String(selected+1).padStart(2,'0')}}</span><b>{{current?.title||'ภาพจะปรากฏที่นี่'}}</b></div></template><span class="ratio-badge">{{project.ratio}}</span></div><div class="preview-controls"><label class="button outline">↑ อัปโหลดภาพ<input hidden type="file" accept="image/*" @change="addImage"></label><button class="button outline" :disabled="!current || generatingSceneId!==null" @click="generateSceneImage">{{generatingSceneId!==null ? 'กำลังสร้างภาพ AI…' : '✦ สร้างภาพ AI'}}</button></div><div v-if="generatingSceneId" class="hint" role="status">{{imageProgress}} · {{imageSeconds}} วินาที</div><div v-if="imageError" class="hint" role="alert">{{imageError}}</div><div v-if="current" class="scene-fields"><label>บทบรรยาย<textarea v-model="current.narration" rows="3" placeholder="เขียนบทบรรยายฉากนี้"></textarea></label><label>Prompt สำหรับภาพ<textarea v-model="current.imagePrompt" rows="3" placeholder="รายละเอียดภาพ มุมกล้อง แสง และบรรยากาศ"></textarea></label><div class="inline-fields"><label>เวลา (วินาที)<input type="number" min="1" max="60" v-model.number="current.duration"></label><label>การเคลื่อนภาพ<select v-model="current.motion"><option>ซูมเข้า</option><option>ซูมออก</option><option>แพนซ้าย</option><option>แพนขวา</option><option>นิ่ง</option></select></label></div></div><div v-else class="preview-note">เลือกหรือสร้างฉากเพื่อแก้ไขรายละเอียด</div></div><div class="tip-card"><span>✦</span><div><b>เคล็ดลับภาพที่เล่าเรื่อง</b><p>เขียนอารมณ์ แสง และมุมกล้องใน prompt เพื่อให้แต่ละฉากต่อเนื่องกัน</p></div></div></div></section>
   <section v-else-if="activePhase===2" class="phase-page"><div class="page-title"><span class="step-tag">PHASE 02 / PRODUCTION</span><h2>เติมเสียง แล้วประกอบเป็นวิดีโอ</h2><p>เพิ่มเสียงพากย์ เพลงประกอบ และคำบรรยายให้เรื่องราวสมบูรณ์</p></div><div class="production-grid"><div class="panel"><h3>เสียงพากย์</h3><p>สร้างเสียงจากบทบรรยายของทุกฉาก หรืออัปโหลดไฟล์เสียงของคุณ</p><textarea :value="project.scenes.map(s=>s.narration).join('\n\n')" @input="project.voice=($event.target as HTMLTextAreaElement).value" placeholder="บทพากย์จะรวมจากฉากของคุณ"></textarea><div class="preview-controls"><button class="button primary" @click="notify('ตั้งค่า TTS provider ใน API ก่อนสร้างเสียง')">✦ สร้างเสียงพากย์</button><label class="button outline">อัปโหลดเสียง<input hidden type="file" accept="audio/*" @change="fileData($event,s=>project.voice=s)"></label></div></div><div class="panel"><h3>ซับไตเติลและวิดีโอ</h3><p>ประกอบภาพ เสียง ซับไตเติล และการเคลื่อนภาพเป็นไฟล์พร้อมตรวจ</p><div class="export-preview"><span>MP4</span><b>{{project.scenes.length}} ฉาก</b><small>{{project.scenes.reduce((a,s)=>a+Number(s.duration||0),0)}} วินาทีโดยประมาณ · {{project.ratio}}</small></div><div class="preview-controls"><button class="button outline" @click="notify('ต้องตั้งค่า FFmpeg ใน API เพื่อสร้าง SRT')">สร้างซับไตเติล</button><button class="button primary" @click="notify('ต้องเปิดใช้งาน video renderer ก่อนส่งออก MP4')">เรนเดอร์วิดีโอ →</button></div></div></div></section>
   <section v-else-if="activePhase===3" class="phase-page"><div class="page-title"><span class="step-tag">PHASE 03 / CONTINUITY</span><h2>ทำให้ตัวละครเป็นคนเดิมทุกฉาก</h2><p>กำหนดรูปลักษณ์หลักและภาพอ้างอิง แล้วนำรายละเอียดไปใช้กับ prompt ของแต่ละฉาก</p></div><div class="panel character-panel"><div class="character-upload" :style="project.character.reference?{backgroundImage:`url(${project.character.reference})`}:{ }"><label>＋<small>เพิ่มภาพอ้างอิง<input hidden type="file" accept="image/*" @change="addCharacter"></small></label></div><div class="character-fields"><label>ชื่อตัวละคร<input v-model="project.character.name" placeholder="เช่น ลูน่า"></label><label>รูปลักษณ์ที่ต้องคงเดิม<textarea v-model="project.character.look" rows="5" placeholder="ผมสีเงินยาว ดวงตาสีฟ้า เสื้อคลุมสีดำ มีเครื่องรางรูปพระจันทร์"></textarea></label><div class="continuity-note">✦ รายละเอียดนี้จะถูกแนบไว้กับทุกฉาก เพื่อช่วยรักษาความต่อเนื่องของตัวละคร</div><button class="button primary" @click="project.scenes.forEach(s=>s.imagePrompt=`${project.character.name}: ${project.character.look}. ${s.imagePrompt}`);notify('เพิ่มรายละเอียดตัวละครลงใน prompt ของทุกฉากแล้ว')">ใช้กับทุกฉาก →</button></div></div></section>
   <section v-else class="phase-page"><div class="page-title"><span class="step-tag">PHASE 04 / YOUTUBE</span><h2>พร้อมให้คนดูเห็นเรื่องของคุณ</h2><p>เตรียมข้อมูลวิดีโอและตรวจทานทุกไฟล์ก่อนเชื่อมต่อ YouTube</p></div><div class="production-grid"><div class="panel"><h3>ข้อมูลวิดีโอ</h3><label>ชื่อคลิป<input v-model="project.metadata.title" placeholder="ชื่อที่ชวนให้ติดตาม"></label><label>คำอธิบาย<textarea v-model="project.metadata.description" rows="5" placeholder="เล่าเรื่องย่อ ใส่เครดิต และข้อมูลที่ต้องการ"></textarea></label><label>แท็ก<input v-model="project.metadata.tags" placeholder="แฟนตาซี, เรื่องเล่า, anime"></label><div class="preview-controls"><button class="button outline" @click="project.metadata.title=project.title;project.metadata.description=project.prompt;notify('เตรียมข้อมูลจากโปรเจกต์แล้ว')">สร้าง metadata จากเรื่อง</button></div></div><div class="panel"><h3>ภาพปกและตรวจทาน</h3><div class="thumbnail-box" :style="project.thumbnail?{backgroundImage:`url(${project.thumbnail})`}:{}"><label v-if="!project.thumbnail">＋ เพิ่มภาพปก<input hidden type="file" accept="image/*" @change="addThumb"></label></div><label class="check-row"><input type="checkbox"> ยืนยันว่าตรวจทานวิดีโอและข้อมูลแล้ว</label><button class="button primary full" @click="notify('ตั้งค่า YouTube OAuth ใน API ก่อนเชื่อมต่อบัญชี')">เชื่อมต่อและอัปโหลดไป YouTube ↗</button><small class="hint">การอัปโหลดต้องตั้งค่า OAuth และต้องกดยืนยันก่อนทุกครั้ง</small></div></div></section>
   <footer class="footer"><span>STORYFRAME <b>·</b> สร้างจากจินตนาการของคุณ</span><span>บันทึกอัตโนมัติในเบราว์เซอร์</span></footer>
  </main><div v-if="toast" class="toast">{{toast}}</div>
 </div>
</template>
