import {seededRandom, angularError, directionPosterior, simulateAdmission} from './models.mjs';

const $ = id => document.getElementById(id);
const colors = {blue:'#79b5dd',green:'#8bc7ad',muted:'#8898aa',line:'#2a3441',purple:'#b6a7e6'};
function canvasContext(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, box.width), height = Math.max(1, box.height);
  if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height); return {ctx,width,height};
}
function arrow(ctx,x,y,dx,dy,color,width=2) {
  const length = Math.hypot(dx,dy); if(length < .01) return;
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=width;
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx,y+dy); ctx.stroke();
  const a=Math.atan2(dy,dx); ctx.beginPath(); ctx.moveTo(x+dx,y+dy);
  ctx.lineTo(x+dx-8*Math.cos(a-.45),y+dy-8*Math.sin(a-.45));
  ctx.lineTo(x+dx-8*Math.cos(a+.45),y+dy-8*Math.sin(a+.45)); ctx.closePath();ctx.fill();
}

// Fixed-cursor, direction-tuned synthetic population. This is not the research decoder.
let random=seededRandom(), goal=45, rotation=0, history=30, running=false, frame=null, inView=true;
let tick=0, position=0, tracePosition=0, prediction=[0,0], samples=0;
const ring=Array.from({length:60},()=>new Float64Array(192));
const traces=Array.from({length:8},()=>new Float64Array(140));
function neuralStep() {
  const angle=(goal+rotation)*Math.PI/180;
  for(let c=0;c<192;c++) {
    const value=Math.cos(angle-c*2*Math.PI/192)+(random()-.5)*2.8;
    ring[position][c]=value;
    if(c%24===0) traces[c/24][tracePosition]=value;
  }
  position=(position+1)%60;tracePosition=(tracePosition+1)%140;tick++;samples++;
  if(tick%2===0) {
    let x=0,y=0;
    for(let c=0;c<192;c++) {
      let mean=0;for(let j=0;j<history;j++) mean+=ring[(position-1-j+60)%60][c];
      mean/=history;x+=mean*Math.cos(c*2*Math.PI/192);y+=mean*Math.sin(c*2*Math.PI/192);
    }
    x*=2/192;y*=2/192;
    if($('oracle-correction').checked) {const a=-rotation*Math.PI/180;[x,y]=[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];}
    prediction=samples>=history?[x,y]:[0,0];
  }
}
function prefill() {for(let i=0;i<140;i++) neuralStep();}
function drawStream() {
  const {ctx,width:w,height:h}=canvasContext($('stream-canvas'));
  const traceRight=w*.58,cx=w*.80,cy=h*.48,r=Math.min(w*.165,h*.31), row=(h-24)/8;
  ctx.font='13px Inter, sans-serif';ctx.textBaseline='middle';
  for(let c=0;c<8;c++) {
    const y=12+row*(c+.5);ctx.fillStyle=colors.muted;ctx.fillText(`CH ${c+1}`,0,y);
    ctx.strokeStyle=colors.blue;ctx.lineWidth=1.35;ctx.beginPath();
    for(let j=0;j<140;j++) {
      const x=43+(traceRight-52)*j/139;
      const yy=y-Math.max(-row*.36,Math.min(row*.36,traces[c][(tracePosition+j)%140]*row*.23));
      if(!j)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }ctx.stroke();
  }
  ctx.strokeStyle=colors.line;ctx.beginPath();ctx.moveTo(w*.62,10);ctx.lineTo(w*.62,h-10);ctx.stroke();
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,x=cx+r*Math.cos(a),y=cy-r*Math.sin(a);
    ctx.beginPath();ctx.arc(x,y,Math.max(4,r*.09),0,Math.PI*2);
    ctx.strokeStyle=goal===i*45?colors.green:colors.muted;ctx.lineWidth=1.6;ctx.stroke();
    if(goal===i*45){ctx.fillStyle=colors.green;ctx.fill();}
  }
  const g=goal*Math.PI/180;
  arrow(ctx,cx,cy,Math.cos(g)*r*.72,-Math.sin(g)*r*.72,colors.green,1.5);
  const norm=Math.hypot(...prediction);
  if(norm>.05)arrow(ctx,cx,cy,prediction[0]/norm*r*.88,-prediction[1]/norm*r*.88,colors.blue,2.8);
  ctx.fillStyle='#c6cfda';ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();
  ctx.font='12px Inter, sans-serif';ctx.fillStyle=colors.muted;ctx.textAlign='center';
  ctx.fillText('Fixed cursor',cx,h-22);ctx.textAlign='left';
  const error=angularError(prediction,[Math.cos(g),Math.sin(g)]);
  $('stream-error').textContent=error===null?'Undefined':`${error.toFixed(1)}°`;
}
let previous=0,accumulator=0;
function animate(now) {
  frame=null;
  if(!running||!inView||document.hidden)return;
  accumulator+=Math.min(.1,(now-previous)/1000);previous=now;
  while(accumulator>=.01){neuralStep();accumulator-=.01;}
  drawStream();frame=requestAnimationFrame(animate);
}
function startLoop(){if(running&&inView&&!document.hidden&&frame===null){previous=performance.now();accumulator=0;frame=requestAnimationFrame(animate);}}
function streamControls() {
  rotation=Number($('stream-rotation').value);history=Number($('stream-history').value)/10;
  $('rotation-value').textContent=`${rotation}°`;$('history-value').textContent=`${history*10} ms`;
  if(!running)prefill();drawStream();
}
$('stream-rotation').addEventListener('input',streamControls);
$('stream-history').addEventListener('input',streamControls);
$('oracle-correction').addEventListener('change',streamControls);
$('stream-toggle').addEventListener('click',()=>{
  running=!running;$('stream-toggle').textContent=running?'Pause stream':'Start stream';
  $('stream-toggle').setAttribute('aria-pressed',String(running));
  if(!running&&frame!==null){cancelAnimationFrame(frame);frame=null;}startLoop();
});
$('stream-reset').addEventListener('click',()=>{
  running=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;
  $('stream-toggle').textContent='Start stream';$('stream-toggle').setAttribute('aria-pressed','false');
  random=seededRandom();goal=45;tick=position=tracePosition=samples=0;
  $('stream-rotation').value=0;$('stream-history').value=300;$('oracle-correction').checked=false;
  document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.target)===45)));
  streamControls();
});
const compass={0:'east',45:'northeast',90:'north',135:'northwest',180:'west',225:'southwest',270:'south',315:'southeast'};
document.querySelectorAll('[data-target]').forEach(button=>{
  button.setAttribute('aria-label',`Target ${compass[button.dataset.target]}`);
  button.addEventListener('click',()=>{goal=Number(button.dataset.target);document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(!running)prefill();drawStream();});
});
new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;startLoop();}).observe($('stream-canvas'));
document.addEventListener('visibilitychange',startLoop);

const stages=[
  ['Causal feature history.','Source-only channel normalization and a trailing 300-ms neural window. Histories never cross declared discontinuities; the 192-channel representation preserves both arrays.'],
  ['Completed-trial inference.','A frozen HMM uses source-derived candidate geometry and received cursor feedback. Completed-trial inference can supervise later updates; actual instructed target identities are not inputs.'],
  ['Reliability-weighted residual fit.','The source-trained reliability model weights expected-direction pseudo-labels. Regularized residual ridge selection uses the permitted calibration prefix. Uniform weighting remains the primary comparator.'],
  ['Guarded snapshot handoff.','The C++ control thread installs a complete model only after feature identity, epoch, version and training-end checks. A candidate must finish training before the current inference history starts. Rollback retains a coherent earlier snapshot.']
];
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  const stage=stages[Number(button.dataset.stage)];$('stage-detail').replaceChildren();
  const strong=document.createElement('strong');strong.textContent=stage[0];$('stage-detail').append(strong,document.createTextNode(' '+stage[1]));
}));

function drawPosterior() {
  const bearing=Number($('posterior-bearing').value),spread=Number($('posterior-spread').value),rotation=Number($('feedback-rotation').value);
  $('spread-value').textContent=spread.toFixed(2);$('bearing-value').textContent=`${bearing}°`;$('feedback-value').textContent=`${rotation}°`;
  const result=directionPosterior(bearing,spread,rotation),{ctx,width:w,height:h}=canvasContext($('posterior-canvas'));
  const cx=w/2,cy=h/2,scale=Math.min(w*.4,h*.4),maximum=Math.max(...result.points.map(p=>p.q));
  ctx.strokeStyle=colors.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-scale,cy);ctx.lineTo(cx+scale,cy);ctx.moveTo(cx,cy-scale);ctx.lineTo(cx,cy+scale);ctx.stroke();
  for(const p of result.points){ctx.beginPath();ctx.arc(cx+p.x*scale,cy-p.y*scale,4+10*Math.sqrt(p.q/maximum),0,Math.PI*2);ctx.fillStyle=`rgba(121,181,221,${.08+.88*p.q/maximum})`;ctx.fill();}
  const reference=bearing*Math.PI/180;
  arrow(ctx,cx,cy,Math.cos(reference)*scale*.85,-Math.sin(reference)*scale*.85,colors.green,2);
  if(result.r>1e-8)arrow(ctx,cx,cy,result.mean[0]/result.r*scale*.7,-result.mean[1]/result.r*scale*.7,colors.blue,3);
  ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.fillStyle='#d1d9e2';ctx.fill();
  $('grid-confidence').textContent=result.exact.toFixed(3);$('direction-confidence').textContent=result.r.toFixed(3);
  $('grid-meter').style.width=`${result.exact*100}%`;$('direction-meter').style.width=`${result.r*100}%`;
  $('posterior-error').textContent=result.error===null?'Undefined':`${result.error.toFixed(1)}°`;
}
['posterior-spread','posterior-bearing','feedback-rotation'].forEach(id=>$(id).addEventListener('input',drawPosterior));

const ns='http://www.w3.org/2000/svg';
function svgNode(name,attributes,text){const node=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
let evidence;
let selectedBudget=100;
function drawBudget(budget) {
  if(!evidence)return;
  selectedBudget=budget;
  const values=evidence.calibration[String(budget)],group=$('budget-bars');group.replaceChildren();
  const compact=$('budget-chart').getBoundingClientRect().width<500;
  $('budget-chart').setAttribute('viewBox',compact?'0 0 390 435':'0 0 760 345');
  const x=v=>(compact?12:225)+(compact?300:450)*v/90;
  const bottom=compact?365:278;
  for(const tick of [0,30,60,90]){group.append(svgNode('line',{x1:x(tick),x2:x(tick),y1:28,y2:bottom,stroke:colors.line}));group.append(svgNode('text',{x:x(tick),y:bottom+24,fill:colors.muted,'font-size':compact?18:15,'text-anchor':compact&&tick===0?'start':'middle'},`${tick}°`));}
  const methods=[['Frozen',evidence.frozen,colors.muted],['Uniform · U',values.U,colors.blue],['Learned reliability · R',values.R,colors.green],['Transferred risk · R_T5',values.R_T5,colors.purple]];
  methods.forEach(([label,value,color],i)=>{const y=compact?58+i*80:45+i*60;group.append(svgNode('text',{x:12,y:compact?y-10:y+21,fill:'#d1dae4','font-size':compact?19:15},label));group.append(svgNode('rect',{x:x(0),y,width:x(value)-x(0),height:29,fill:color,rx:3}));group.append(svgNode('text',{x:x(value)+10,y:y+21,fill:'#f0f3f6','font-size':compact?19:16},`${value.toFixed(2)}°`));});
  group.append(svgNode('line',{x1:x(values.supervised),x2:x(values.supervised),y1:28,y2:bottom,stroke:'#e3b879','stroke-dasharray':'4 4'}));
  group.append(svgNode('text',{x:compact?12:225,y:compact?424:331,fill:colors.muted,'font-size':compact?16:14},`${compact?'Dashed: supervised':'Dashed: matched supervised reference'} ${values.supervised.toFixed(2)}°`));
  $('budget-chart-title').textContent=`Median angular error at ${budget} raw calibration trials`;
  $('budget-chart-desc').textContent=methods.map(([label,value])=>`${label}: ${value.toFixed(2)} degrees`).join('; ');
  $('budget-caption').textContent=`Measured medians across 120 T11 sessions at ${budget} raw trials: U ${values.U.toFixed(2)}°, R ${values.R.toFixed(2)}°, R_T5 ${values.R_T5.toFixed(2)}°. Identical later post-100-trial scoring rows across methods and budgets. Lower is better.`;
  document.querySelectorAll('[data-budget]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.budget)===budget)));
}
document.querySelectorAll('[data-budget]').forEach(button=>button.addEventListener('click',()=>drawBudget(Number(button.dataset.budget))));
fetch('assets/stablebci/evidence.json').then(r=>{if(!r.ok)throw Error('Evidence unavailable');return r.json();}).then(data=>{evidence=data;drawBudget(100);}).catch(()=>{
  const image=document.createElement('img');image.src='assets/stablebci/t11-results.svg';image.alt='Measured T11 median errors at 100 trials: frozen 69.38, U 34.61, R 32.25 and transferred T5 reliability 32.30 degrees.';$('budget-chart').replaceWith(image);
  document.querySelectorAll('[data-budget]').forEach(b=>b.disabled=true);
});

function updateSimLabels(){$('sim-gap-value').textContent=`${Number($('sim-gap').value).toFixed(1)}%`;$('sim-service-value').textContent=`${$('sim-service').value} ms`;}
['sim-gap','sim-service'].forEach(id=>$(id).addEventListener('input',updateSimLabels));
function renderSimulation(){
  const decoupled=document.querySelector('input[name="collection-policy"]:checked').value==='decoupled';
  const result=simulateAdmission({gapRate:Number($('sim-gap').value)/100,serviceMs:Number($('sim-service').value),decoupled});
  $('sim-delivered').textContent=result.delivered;$('sim-rejected').textContent=result.rejected;
  $('sim-resets').textContent=result.resets;$('sim-updates').textContent=result.opportunities;
  $('sim-summary').textContent=`Synthetic result: ${result.completed} completed trials; ${result.stale} queued records became stale; ${result.invalid} incomplete records admitted as unusable placeholders; ${result.pending} records pending or in service at the horizon. ${result.skipped} toy command releases skipped. ${decoupled?'The preserved-prefix policy is a hypothesis, not a measured repair.':'Epoch invalidation can starve calibration even when the worker is fast.'}`;
}
$('run-simulation').addEventListener('click',renderSimulation);
window.addEventListener('resize',()=>{drawStream();drawPosterior();drawBudget(selectedBudget);});
prefill();drawStream();drawPosterior();updateSimLabels();renderSimulation();
