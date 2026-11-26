// Adult screening reference values. BMI: Malaysia MOH obesity CPG 2023, table 2-1.
// BP: AHA adult reading categories, with a low-reading screening flag.
const validMeasurement=(v,min,max)=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max;
const adultReference=age=>age==null||String(age).trim()===''||Number(age)>18;
const roundBMI=b=>Number.isFinite(b)?Math.round(b*10+1e-10)/10:null;
const classify=b=>{b=roundBMI(b);return !Number.isFinite(b)||b<=0?{l:'',c:''}:b<18.5?{l:'Underweight',c:'under'}:b<23?{l:'Normal',c:'normal'}:b<27.5?{l:'Overweight',c:'atrisk'}:b<32.5?{l:'Obese I',c:'obese1'}:b<37.5?{l:'Obese II',c:'obese2'}:{l:'Obese III',c:'obese3'}};
const bmiOf=(h,w)=>validMeasurement(h,50,250)&&validMeasurement(w,10,400)?Number(w)/(Number(h)/100)**2:null;
const normalWeight=h=>{if(!validMeasurement(h,50,250))return null;const m=(Number(h)/100)**2;return {min:18.45*m,maxExclusive:22.95*m}};
const weightRange=h=>{const r=normalWeight(h);return r?`${(Math.ceil(r.min*10-1e-9)/10).toFixed(1)}–${((Math.ceil(r.maxExclusive*10-1e-9)-1)/10).toFixed(1)} kg`:''};
const classifyBP=(s,d)=>{if(!validMeasurement(s,50,300)||!validMeasurement(d,30,200)||Number(s)<=Number(d))return null;s=Number(s);d=Number(d);return s>=180||d>=120?{l:'Very high BP — urgent assessment',c:'high',severe:true}:s>=140||d>=90?{l:'Stage 2 range',c:'high'}:s>=130||d>=80?{l:'Stage 1 range',c:'mid'}:s<90||d<60?{l:'Low BP reading',c:'mid'}:s>=120?{l:'Elevated BP',c:'mid'}:{l:'Normal BP',c:'normal'}};

// Owner-selected policy: round half up to one decimal before classification.
const displayBMI=b=>Number.isFinite(b)&&b>0?roundBMI(b).toFixed(1):"";

// Linear gauge on the same rounded scale used for the displayed category.
const BMI_SCALE_MIN=10,BMI_SCALE_MAX=45;
const bmiGaugePosition=b=>{const v=roundBMI(b);return v===null||v<=0?null:Math.max(0,Math.min(100,(v-BMI_SCALE_MIN)/(BMI_SCALE_MAX-BMI_SCALE_MIN)*100))};

// Optional adult screening blocks; owner-provided cut-offs, not diagnostic criteria.
const LAB_SCREEN={
 glucose_fasting:{label:'Fasting blood glucose',limit:5.6,glucose:true,context:'Fasting capillary screening flag'},
 glucose_random:{label:'Random blood glucose',limit:7.8,glucose:true,context:'Random capillary screening flag'},
 glucose_ogtt:{label:'2-hour OGTT glucose',limit:7.8,glucose:true,context:'2-hour oral glucose tolerance test (not ordinary post-meal glucose)'},
 cholesterol_total:{label:'Total cholesterol',limit:5.2,glucose:false,context:'LifeCare screening cut-off supplied by form owner'}
};
const isLabScreen=t=>Object.hasOwn(LAB_SCREEN,t);
const labNumber=v=>{if(v==null||typeof v==='boolean'||typeof v==='object'||!/^\d+(?:[.,]\d+)?$/.test(String(v).trim()))return null;const n=Number(String(v).trim().replace(',','.'));return Number.isFinite(n)&&n>0&&n<=100?n:null};
const classifyLab=(type,v)=>{if(!isLabScreen(type))return null;const n=labNumber(v),r=LAB_SCREEN[type];if(n===null)return null;return r.glucose&&n<3.9?{l:'Low',c:'mid'}:n>=r.limit?{l:'High',c:'high'}:{l:'Normal',c:'normal'}};
const labReference=type=>{const r=LAB_SCREEN[type];return r?{normal:r.glucose?'3.9 to below '+r.limit:'Below '+r.limit,high:'≥ '+r.limit,low:r.glucose?'Below 3.9':null}:null};

// Display-only linear axes, not additional clinical thresholds. Classify raw readings.
const labGaugeScale=type=>{
 if(!isLabScreen(type))return null;
 const r=LAB_SCREEN[type],max=r.glucose?(type==='glucose_fasting'?10:14):10;
 const segments=r.glucose?[{min:0,max:3.9,label:'Low',range:'< 3.9',color:'#e9c45d'},{min:3.9,max:r.limit,label:'Normal',range:'3.9–< '+r.limit,color:'#63b38b'},{min:r.limit,max,label:'High',range:'≥ '+r.limit,color:'#e37b70'}]:[{min:0,max:r.limit,label:'Normal',range:'< '+r.limit,color:'#63b38b'},{min:r.limit,max,label:'High',range:'≥ '+r.limit,color:'#e37b70'}];
 return {min:0,max,segments,ticks:segments.slice(0,-1).map(s=>s.max)};
};
const labGaugePosition=(type,value)=>{
 const axis=labGaugeScale(type),n=labNumber(value);
 return !axis||n===null?null:Math.min(100,Math.max(0,(n-axis.min)/(axis.max-axis.min)*100));
};
