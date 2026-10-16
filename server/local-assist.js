// Offline helpers: deterministic extraction and drafting, never a hosted AI call.
const reviewWarning='無料のルールベース処理です。原本と照合し、文章をご本人の言葉に編集してください。';
function dateValue(s){
 const m=s.match(/(?:(令和|平成|昭和)(元|\d{1,2})|((?:19|20)\d{2}))[年\/.\-\s]+(\d{1,2})(?:[月\/.\-\s]+(\d{1,2}))?/);
 if(!m)return '';const year=m[1]?({令和:2018,平成:1988,昭和:1925}[m[1]]+(m[2]==='元'?1:Number(m[2]))):Number(m[3]);const month=Number(m[4]),day=m[5]?Number(m[5]):null;
 if(month<1||month>12||day!==null&&(day<1||day>31))return '';
 if(day!==null){const d=new Date(Date.UTC(year,month-1,day));if(d.getUTCMonth()!==month-1)return '';}
 return `${year}-${String(month).padStart(2,'0')}`+(day===null?'':`-${String(day).padStart(2,'0')}`);
}
export function extractFields(text){
 const data={},warnings=[reviewWarning];const lines=text.normalize('NFKC').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const labels={name:'氏\\s*名|お名前|名前|Name',furigana:'ふりがな|フリガナ',birthDate:'生年月日|Date of birth',postalCode:'郵便番号',address:'現住所|住所|Address',addressKana:'住所ふりがな',phone:'電話番号|電話|携帯電話|TEL|Phone',email:'メールアドレス|メール|E-mail|Email',gender:'性別'};
 const anyLabel=new RegExp(`^(?:${Object.values(labels).join('|')})[\\s:：|]`,'i');
 for(const [key,label] of Object.entries(labels)){
  const rx=new RegExp(`^(?:${label})(?:[\\s:：|]+|$)(.*)$`,'i');
  for(let i=0;i<lines.length;i++){const m=lines[i].match(rx);if(!m)continue;let value=m[1].replace(/^[|:：\s]+/,'').trim();if(!value&&lines[i+1]&&!anyLabel.test(lines[i+1]))value=lines[i+1];if(value)data[key]=value.slice(0,300);break;}
 }
 const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(email)data.email=email[0];
 const phone=text.match(/(?<![\d-])(?:0\d{1,4})[-ー－](?:\d{1,4})[-ー－]\d{4}(?!\d)/);if(phone&&!data.phone)data.phone=phone[0];
 const postal=text.match(/(?:〒|郵便番号\s*[:：]?)\s*(\d{3}[-ー－]\d{4})/);if(postal)data.postalCode=postal[1];
 if(data.birthDate){const v=dateValue(data.birthDate);if(v.length===10)data.birthDate=v;else{delete data.birthDate;warnings.push('生年月日を確定できませんでした。手入力で確認してください。');}}
 if(data.gender&&!['男性','女性','その他'].includes(data.gender))delete data.gender;
 let section=null;
 for(const line of lines){
  const header=line.replace(/[\s|]/g,'');
  if(/^(学歴|教育歴)$/.test(header)){section='education';continue;}
  if(/^(職歴|職務経歴)$/.test(header)){section='experience';continue;}
  if(/^(免許[・／/]?資格|免許|資格)$/.test(header)){section='licenses';continue;}
  if(/^(志望|本人希望|自己PR|特技|職務要約)/.test(header)){section=null;continue;}
  if(!section)continue;
  const dated=line.match(/^((?:(?:19|20)\d{2}|令和(?:元|\d{1,2})|平成(?:元|\d{1,2})|昭和(?:元|\d{1,2}))[年\s|/.-]+\d{1,2}月?)\s*[|:：]?\s*(.+)$/);
  if(dated){const date=dateValue(dated[1].replace(/\|/g,' '));if(date){data[section]??=[];data[section].push({date:date.slice(0,7),end:'',name:dated[2].trim(),detail:''});}}
 }
 if(!Object.keys(data).length)warnings.push('確実に読み取れる項目が見つかりませんでした。読取テキストを参照して手入力してください。');
 else warnings.push('ラベルや日付の形式が異なる項目は空欄のままです。学歴・職歴・資格の漏れを確認してください。');
 return {data,warnings,mode:'local-rules'};
}
function excerpt(text){return String(text||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,110).replace(/[「」]/g,'');}
export function createDraft(d){
 const job=[d.jobText,d.jobNotes].filter(Boolean).join('\n');
 if(!job.trim())throw Error('求人票または求人についてのメモを追加してください。');
 const career=[...(d.experience||[]).map(r=>[r.name,r.detail].filter(Boolean).join('：')),d.skills,d.careerText,d.careerNotes].filter(Boolean).join('\n');
 const keywords=['法人営業','営業','接客','顧客対応','マネジメント','経理','会計','事務','介護','看護','開発','設計','製造','採用','マーケティング','データ分析','翻訳','物流','品質管理'];
 const matches=keywords.filter(k=>job.includes(k)&&career.includes(k));const common=matches.filter(k=>!matches.some(v=>v!==k&&v.includes(k))).slice(0,3);
 const jobLines=job.split('\n').map(l=>l.trim()).filter(Boolean);const focus=excerpt(jobLines.find(l=>/仕事内容|業務内容|職種|募集|求める/.test(l))||jobLines[0]);const evidence=excerpt(career);
 const warnings=[reviewWarning,'生成文は定型文の組み合わせです。本人の意向・求人内容に合うか確認してください。'];
 const contribution=common.length?`これまでの${common.join('・')}に関する経験を活かし、`:'これまでの経験を振り返り、応募業務との接点を明確にしたうえで、';
 const motivation=`求人資料に記載された「${focus}」に関心を持ち、応募いたしました。${contribution}業務を一つひとつ正確に理解し、周囲と協力しながら貴社に貢献したいと考えております。`;
 const strengths=evidence?`これまでの経験として、「${evidence}」があります。この経験の中で身につけたことを応募業務に結びつけ、丁寧な対応と継続的な学習を通じて、貴社で役割を果たしていきたいと考えております。`:'';
 if(!evidence)warnings.push('応募者の経歴が不足しているため、自己PR・職務要約は生成していません。経歴や補足メモを追加してください。');
 return {data:{motivation,strengths,additional:strengths?`${strengths}\n\n${motivation}`:'',summary:evidence?`これまで「${evidence}」に取り組んできました。`:''},warnings,mode:'local-templates'};
}
export function assist({task,text='',document}){if(task==='extract')return extractFields(text);if(task==='transcribe')return {data:{text},warnings:text.trim()?[reviewWarning]:['テキストを読み取れませんでした。原本を確認して入力してください。'],mode:'local-ocr'};return createDraft(document);}
