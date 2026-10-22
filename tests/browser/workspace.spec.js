import {test,expect} from '@playwright/test';
test('complete a Japanese résumé, save, export, and restore history',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:'一人ひとりの可能性を、書類に。'})).toBeVisible();await page.getByLabel('氏名',{exact:true}).fill('山田 太郎');await page.getByLabel('ふりがな',{exact:true}).fill('やまだ たろう');await page.getByLabel('生年月日').fill('1994-05-12');await page.getByLabel('メールアドレス').fill('taro@example.com');await page.getByLabel('現住所',{exact:true}).fill('東京都千代田区1-2-3');await expect(page.locator('.save-status')).toContainText('保存済み');await page.getByRole('button',{name:'次へ進む'}).click();await page.getByRole('button',{name:'学歴を追加'}).click();await page.getByLabel('入学年月',{exact:true}).fill('2013-04');await page.getByLabel('学校名・学部',{exact:true}).fill('〇〇大学 経済学部');await page.getByRole('button',{name:'次へ進む'}).click();await page.getByRole('button',{name:'職歴を追加'}).click();await page.getByLabel('会社名・部署・職種').fill('株式会社テスト 営業部');await page.getByLabel('入社年月',{exact:true}).fill('2017-04');await page.getByLabel('退社年月',{exact:true}).fill('2025-03');await expect(page.locator('.paper-stage')).toContainText('株式会社テスト 営業部　入社');await expect(page.locator('.paper-stage')).toContainText('株式会社テスト 営業部　退社');await page.getByRole('button',{name:'次へ進む'}).click();await page.getByRole('button',{name:'次へ進む'}).click();await page.getByLabel('補足メモ（自由入力）').first().fill('営業担当を募集。顧客との信頼関係を重視。');await page.getByLabel('補足メモ（自由入力）').nth(1).fill('法人営業の経験を活かしたい。');await page.getByRole('button',{name:/資料をもとに志望動機/}).click();await expect(page.getByRole('dialog')).toContainText('下書きを確認');await page.getByRole('button',{name:'閉じる',exact:true}).click();await page.getByLabel('志望の動機',{exact:true}).fill('これまでの法人営業の経験を活かし、顧客との信頼関係を大切に貢献したいと考えています。');await page.getByRole('button',{name:'次へ進む'}).click();await page.getByRole('button',{name:'次へ進む'}).click();await page.getByLabel('内容を原本と照合し、出力する書類を確認しました。').check();const download=page.waitForEvent('download');await page.getByRole('button',{name:'PDFをダウンロード'}).click();const file=await download;expect(file.suggestedFilename()).toContain('山田 太郎_履歴書.pdf');await expect(page.getByText('書類を作成し、生成履歴に保存しました。')).toBeVisible();await page.getByRole('button',{name:/生成履歴/}).click();await expect(page.locator('.archive-list')).toContainText('山田 太郎');await page.getByRole('button',{name:'コピーして編集'}).first().click();await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('山田 太郎');await page.screenshot({path:'/tmp/ma-workspace-desktop.png',fullPage:true});expect(errors).toEqual([]);});
test('image upload and crop preserve a replaceable applicant photo',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'証明写真 写真を追加 3 : 4'}).click();const buffer=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1kAAAAASUVORK5CYII=','base64');await page.getByRole('dialog').locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer});await expect(page.getByAltText('切り抜く写真')).toBeVisible();await page.getByRole('button',{name:'この写真を使用'}).click();await expect(page.getByAltText('応募者の証明写真')).toBeVisible();});
test('mobile layout remains usable without horizontal overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByLabel('氏名',{exact:true})).toBeVisible();await page.getByLabel('氏名',{exact:true}).fill('佐藤 花子');await expect(page.getByRole('button',{name:'プレビュー',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'/tmp/ma-workspace-mobile.png',fullPage:true});});
test('local review and writing UI with mocked helper responses preserve unselected fields',async({page})=>{const calls=[];await page.route('**/api/status',route=>route.fulfill({json:{assistMode:'local',loginRequired:false,mode:'development'}}));await page.route('**/api/assist',async route=>{const body=route.request().postDataJSON();calls.push(body);await route.fulfill({json:body.task==='extract'?{data:{name:'抽出された別名',education:[{date:'2010-04',end:'',name:'テスト大学 入学',detail:''}]},warnings:['氏名を原本と照合してください。']}:{data:{motivation:'顧客への提案経験を活かし、貴社の営業活動に貢献したいと考えています。',strengths:'お客様のお話を丁寧に伺う姿勢が強みです。',additional:'顧客対応経験を活かして貢献します。',summary:'法人営業を担当してきました。'},warnings:[]}});});await page.goto('/');await page.getByLabel('氏名',{exact:true}).fill('保持する氏名');await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('氏名：抽出された別名\nテスト大学 入学')});await expect(page.getByRole('dialog')).toContainText('読取結果を確認');await page.locator('.ai-review-item').filter({hasText:'氏名'}).getByRole('checkbox').uncheck();await expect(page.getByRole('button',{name:'選択した項目を反映'})).toBeDisabled();await page.getByRole('checkbox',{name:'同じ応募者の資料であることを確認しました'}).check();await page.getByRole('button',{name:'選択した項目を反映'}).click();await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('保持する氏名');await page.getByRole('button',{name:'5 志望動機・特技',exact:true}).click();await page.getByLabel('補足メモ（自由入力）').first().fill('顧客との信頼関係を重視する営業職');await page.getByLabel('補足メモ（自由入力）').nth(1).fill('応募者は法人営業を経験');await page.getByRole('button',{name:/資料をもとに志望動機/}).click();await expect(page.getByRole('dialog')).toContainText('下書きを確認');await page.getByRole('button',{name:'選択した項目を反映'}).click();await expect(page.getByLabel('志望の動機',{exact:true})).toHaveValue(/顧客への提案経験/);const writing=calls.find(c=>c.task==='write');expect(writing.document.jobNotes).toContain('営業職');expect(writing.document.careerNotes).toContain('法人営業');await page.getByLabel('志望の動機',{exact:true}).fill('スタッフが編集した志望動機');await expect(page.getByLabel('志望の動機',{exact:true})).toHaveValue('スタッフが編集した志望動機');});
test('Gemini configuration displays provider disclosure and sends uploads for review',async({page})=>{await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false,mode:'development'}}));let called=false;await page.route('**/api/assist',r=>{called=true;return r.fulfill({json:{data:{name:'Gemini読取テスト'},warnings:['原本と照合してください。'],mode:'gemini'}});});await page.goto('/');await expect(page.locator('.local-notice')).toContainText('Gemini設定済み');await expect(page.getByText('アップロード後、資料のテキスト・先頭8ページの画像をGeminiへ送信して読み取ります。')).toBeVisible();await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('氏名：テスト')});await expect(page.getByRole('dialog')).toContainText('Gemini読取テスト');expect(called).toBe(true);await page.getByRole('button',{name:'選択した項目を反映'}).click();await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('Gemini読取テスト');});
test('desktop settings open native key settings and can deliberately stop the app',async({page})=>{await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'local',geminiConfigured:false,desktopMode:true,loginRequired:false,mode:'development'}}));let keySettings=0,stopped=0;await page.route('**/api/desktop/settings',r=>{keySettings++;return r.fulfill({json:{ok:true}});});await page.route('**/api/desktop/stop',r=>{stopped++;return r.fulfill({json:{ok:true}});});await page.goto('/');await page.locator('.save-status button').click();await page.getByRole('button',{name:'Geminiキーを設定'}).click();await expect(page.getByText('MacのGemini設定ウィンドウを開きます。')).toBeVisible();expect(keySettings).toBe(1);await page.locator('.save-status button').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'アプリを停止',exact:true}).click();await expect(page.getByText('アプリを停止しました。次回はMacのM&A Groupアイコンから開いてください。')).toBeVisible();expect(stopped).toBe(1);});
test('résumé preview has two sheets and career document uses its own layout',async({page})=>{await page.goto('/');await expect(page.locator('.paper-stage .mhlw-paper')).toHaveCount(2);await expect(page.locator('.paper-stage')).toContainText('性別（任意）');await expect(page.locator('.paper-stage')).toContainText('連絡先');await page.getByRole('button',{name:'職務経歴書',exact:true}).click();await page.getByRole('button',{name:'切り替える',exact:true}).click();await expect(page.locator('.paper-stage .career-paper')).toHaveCount(1);await expect(page.locator('.paper-stage .paper-photo')).toHaveCount(0);await expect(page.locator('.paper-stage')).toContainText('職務要約');await expect(page.locator('.paper-stage')).toContainText('自己PR');await expect(page.getByLabel('生年月日')).toHaveCount(0);await page.getByRole('button',{name:'3 職務経歴',exact:true}).click();await page.getByRole('button',{name:'もうひとつ勤務先追加'}).click();await page.getByLabel('会社名・部署・職種').fill('株式会社キャリア');await page.getByLabel('事業内容',{exact:true}).fill('法人向けサービス');await page.getByLabel('雇用形態',{exact:true}).fill('正社員');await expect(page.locator('.paper-stage')).toContainText('株式会社キャリア');await expect(page.locator('.paper-stage')).toContainText('法人向けサービス');});
test('career has six editable sections, larger black fields, qualifications and language levels',async({page})=>{await page.goto('/');await expect(page).toHaveTitle('M&A CV creation');await page.getByRole('button',{name:'職務経歴書',exact:true}).click();await page.getByRole('button',{name:'切り替える',exact:true}).click();await expect(page.getByLabel('職務要約',{exact:true})).toBeVisible();await page.getByLabel('職務要約',{exact:true}).fill('法人営業を担当しました。');await page.getByLabel('氏名',{exact:true}).fill('山田 太郎');await page.getByLabel('記入日',{exact:true}).fill('2026-10-16');const styles=await page.getByLabel('氏名',{exact:true}).evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color}));expect(styles.size).toBeGreaterThanOrEqual(16);expect(styles.color).toBe('rgb(17, 17, 17)');await page.getByRole('button',{name:'5 資格・語学力',exact:true}).click();await page.getByRole('button',{name:'もうひとつ追加',exact:true}).click();await page.getByLabel('資格名',{exact:true}).fill('普通自動車運転免許');await page.getByLabel('取得年月',{exact:true}).fill('2018-03');await page.getByRole('button',{name:'語学力をもうひとつ追加'}).click();await page.getByLabel('言語',{exact:true}).fill('日本語');const levels=['ネイティブレベル','ネイティブに近いレベル','ビジネスレベル','日常会話レベル','挨拶レベル'];for(const level of levels)await expect(page.getByRole('option',{name:level,exact:true})).toHaveCount(1);await page.getByLabel('レベル',{exact:true}).selectOption('ビジネスレベル');await page.getByLabel('語学資格',{exact:true}).fill('日本語能力試験 N1');await page.getByLabel('語学資格 取得年月',{exact:true}).fill('2022-07');await expect(page.locator('.paper-stage')).toContainText('日本語能力試験 N1');await expect(page.locator('.paper-stage')).toContainText('6. 自己PR・志望動機');await expect(page.locator('.paper-stage .career-section>h3').first()).toHaveCSS('border-bottom-width','0px');await expect(page.locator('.save-status')).toContainText('保存済み');await page.getByRole('button',{name:/下書き/}).click();await page.getByRole('button',{name:'編集を続ける'}).first().click();await page.getByRole('button',{name:'5 資格・語学力',exact:true}).click();await expect(page.getByLabel('言語',{exact:true})).toHaveValue('日本語');});
test('failed Gemini import preserves existing fields and retries the same upload before filling all sections',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false,mode:'development'}}));
 let calls=0;await page.route('**/api/assist',r=>{calls++;return calls===1?r.fulfill({status:502,json:{mode:'gemini-error',code:'INVALID_API_KEY',error:'Geminiキーが無効です。設定してください。'}}):r.fulfill({json:{mode:'gemini',warnings:[],data:{name:'山田 太郎',address:'東京都千代田区1-1',phone:'090-1234-5678',education:[{date:'2015-04',name:'テスト大学 入学'}],experience:[{date:'2019-04',end:'2024-03',name:'株式会社サンプル'}],licenses:[{date:'2018-06',name:'テスト資格'}]}}});});
 await page.goto('/');await page.getByLabel('氏名',{exact:true}).fill('山田 太郎');
 await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('氏名：山田 太郎\n現住所：東京都千代田区1-1')});
 await expect(page.getByRole('dialog')).toContainText('AI読取に失敗しました');await expect(page.getByRole('dialog')).toContainText('Geminiキーが無効');await expect(page.getByRole('button',{name:'選択した項目を反映'})).toHaveCount(0);
 await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('山田 太郎');
 await page.getByRole('button',{name:'AIで再試行'}).click();await expect(page.getByRole('dialog')).toContainText('株式会社サンプル');await expect(page.getByRole('dialog')).toContainText('テスト大学');await expect(page.getByRole('dialog')).toContainText('テスト資格');
 await page.getByRole('button',{name:'選択した項目を反映'}).click();await expect(page.getByLabel('現住所',{exact:true})).toHaveValue('東京都千代田区1-1');await expect(page.getByLabel('電話番号',{exact:true})).toHaveValue('090-1234-5678');expect(calls).toBe(2);
});
test('settings tests the connection and shows actionable failures before a successful retry',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false,mode:'development'}}));let calls=0;
 await page.route('**/api/assist',r=>{calls++;return calls===1?r.fulfill({status:502,json:{error:'Geminiキーが無効です。',code:'INVALID_API_KEY'}}):r.fulfill({json:{data:{text:'接続OK'},mode:'gemini',warnings:[]}});});
 await page.goto('/');await page.locator('.save-status button').click();await page.getByRole('button',{name:'選択したAIの接続を確認'}).click();await expect(page.getByRole('dialog')).toContainText('Geminiキーが無効です。');await page.getByRole('button',{name:'選択したAIの接続を確認'}).click();await expect(page.getByRole('dialog')).toContainText('Geminiへの接続に成功しました。');expect(calls).toBe(2);
});
test('unverified writing is withheld, preserves original text, and a verified retry shows source evidence',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false,mode:'development'}}));let calls=0;
 await page.route('**/api/assist',r=>{calls++;return calls===1?r.fulfill({status:502,json:{code:'UNSUPPORTED_CLAIMS',error:'経歴資料に裏付けのない表現が残ったため、下書きを表示していません。'}}):r.fulfill({json:{mode:'gemini',data:{motivation:'Python開発の経験を土台に、応募業務を学んでいきたいと考えています。',strengths:'',summary:'Python開発を担当しました。',additional:''},warnings:['求人との不足・確認点：営業経験は確認できません。'],grounding:{verified:true,attempts:1,facts:[{id:'F1',sourceId:'career',quote:'Python開発を担当'}],gaps:['営業経験は確認できません。']}}});});
 await page.goto('/');await page.getByRole('button',{name:'5 志望動機・特技',exact:true}).click();await page.getByLabel('志望の動機',{exact:true}).fill('応募者が記入した原文');await page.getByLabel('補足メモ（自由入力）').first().fill('営業担当の求人');await page.getByRole('button',{name:/資料をもとに志望動機/}).click();
 await expect(page.getByRole('dialog')).toContainText('下書きを確認できませんでした');await expect(page.getByRole('button',{name:'選択した項目を反映'})).toHaveCount(0);await expect(page.getByLabel('志望の動機',{exact:true})).toHaveValue('応募者が記入した原文');
 await page.getByRole('button',{name:'AIで再試行'}).click();await expect(page.getByRole('dialog')).toContainText('営業経験は確認できません');await page.getByText('文章の根拠を確認（応募者資料との照合済み）').click();await expect(page.getByRole('dialog')).toContainText('Python開発を担当');await page.getByRole('button',{name:'選択した項目を反映'}).click();await expect(page.getByLabel('志望の動機',{exact:true})).toHaveValue(/Python開発/);
});
test('AI settings offer Gemini and Groq without Ollama model downloads',async({page})=>{
 await page.goto('/');await page.locator('.save-status button').click();
 await expect(page.getByRole('dialog')).not.toContainText('gemma3:4b');
 await expect(page.getByRole('dialog')).not.toContainText('Ollama');
 await page.getByLabel('AIの選択').selectOption('gemini-groq');
 await page.getByRole('button',{name:'AI設定を保存'}).click();
 await expect(page.getByRole('dialog')).toContainText('AI設定を保存しました');
});
test('a slow import shows elapsed time and can be cancelled without applying late results',async({page})=>{
 let release,called;const blocked=new Promise(r=>release=r),started=new Promise(r=>called=r);
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'ollama',geminiConfigured:false,loginRequired:false}}));
 await page.route('**/api/assist',async r=>{called();await blocked;try{await r.fulfill({json:{mode:'ollama',data:{name:'遅延した別名'},warnings:[]}});}catch{}});
 await page.goto('/');await page.getByLabel('氏名',{exact:true}).fill('保持する氏名');await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('氏名：テスト')});await started;
 await expect(page.locator('.busy-overlay')).toContainText('経過時間');await page.getByRole('button',{name:'処理を中止',exact:true}).click();await expect(page.locator('.busy-overlay')).toHaveCount(0);release();await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('保持する氏名');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.file-chip').filter({hasText:'slow.txt'})).toBeVisible();
});
test('Groq configuration uses native key settings and tests Groq separately from Gemini',async({page})=>{
 let selected=false,keyOpened=false;
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,groqConfigured:false,desktopMode:true,aiSettings:{mode:selected?'gemini-groq':'auto',ollamaModel:'gemma3:4b',groqModel:'openai/gpt-oss-120b'},loginRequired:false}}));
 await page.route('**/api/ai/settings',r=>{const data=r.request().postDataJSON();expect(data.mode).toBe('gemini-groq');expect(data.groqModel).toBe('openai/gpt-oss-120b');expect(data).not.toHaveProperty('apiKey');selected=true;return r.fulfill({json:data});});
 await page.route('**/api/ai/check',r=>{expect(r.request().postDataJSON()).toEqual({provider:'groq'});return r.fulfill({json:{mode:'groq'}});});
 await page.route('**/api/desktop/groq-settings',r=>{keyOpened=true;return r.fulfill({json:{ok:true}});});
 await page.goto('/');await page.locator('.save-status button').click();await page.getByLabel('AIの選択').selectOption('gemini-groq');await page.getByRole('button',{name:'AI設定を保存'}).click();await page.getByRole('button',{name:'Groq接続を確認',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Groqへの接続に成功しました');await page.getByRole('button',{name:'Groqキーを設定',exact:true}).click();expect(keyOpened).toBe(true);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.local-notice')).toContainText('Groq');
});
test('native-text job upload is ready for writing with zero AI transcription calls',async({page})=>{
 const text='求人票 全4ページの原文\n輸出入業務と英語力\n最終ページの会社情報';let aiCalls=0;
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,groqConfigured:true,aiSettings:{mode:'gemini-groq'},loginRequired:false}}));
 await page.route('**/api/extract',r=>r.fulfill({json:{text,textReady:true,pageCount:4,pages:[],photos:[],warnings:[]}}));
 await page.route('**/api/assist',r=>{aiCalls++;return r.fulfill({status:502,json:{error:'This transcription must never be called'}});});
 await page.goto('/');await page.getByRole('button',{name:'5 志望動機・特技',exact:true}).click();
 await page.locator('.source-box').first().locator('input[type=file]').setInputFiles({name:'job.pdf',mimeType:'application/pdf',buffer:Buffer.from('test fixture')});
 await expect(page.getByText('求人票の資料全体を原文のまま読み込みました。自己PR作成に使用できます。')).toBeVisible();
 await page.locator('.source-box').first().getByText('読取テキストを確認・編集').click();
 await expect(page.locator('.source-box').first().locator('details textarea')).toHaveValue(text.startsWith('\n')?text:'\n'+text);
 expect(aiCalls).toBe(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('JPEG job OCR loads without cloud transcription and remains editable',async({page})=>{
 const text='JPEGの求人票から読み取った応募条件と会社情報';let calls=0;
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,groqConfigured:true,loginRequired:false}}));
 await page.route('**/api/extract',r=>r.fulfill({json:{text,textReady:false,ocrTextReady:true,pageCount:1,pages:['data:image/jpeg;base64,YWJj'],photos:[],warnings:['OCRの誤字を確認してください。']}}));
 await page.route('**/api/assist',r=>{calls++;return r.fulfill({status:502,json:{error:'Cloud quota must not affect loading this image'}});});
 await page.goto('/');await page.getByRole('button',{name:'5 志望動機・特技',exact:true}).click();
 await page.locator('.source-box').first().locator('input[type=file]').setInputFiles({name:'job.jpg',mimeType:'image/jpeg',buffer:Buffer.from('test fixture')});
 await expect(page.getByText('求人票の画像全体をOCRで読み込みました。読取テキストを確認してから自己PR作成に使用してください。')).toBeVisible();
 await page.locator('.source-box').first().getByText('読取テキストを確認・編集').click();await expect(page.locator('.source-box').first().locator('details textarea')).toHaveValue('\n'+text);expect(calls).toBe(0);
});
test('successful retry replaces raw job text once and clears the old failure dialog',async({page})=>{
 const text='求人票の原文と応募条件';let calls=0;
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false}}));
 await page.route('**/api/extract',r=>r.fulfill({json:{text,textReady:false,ocrTextReady:false,pages:[],photos:[],warnings:[]}}));
 await page.route('**/api/assist',r=>++calls===1?r.fulfill({status:502,json:{error:'一時的な読取エラー'}}):r.fulfill({json:{mode:'gemini',data:{text},warnings:[]}}));
 await page.goto('/');await page.getByRole('button',{name:'5 志望動機・特技',exact:true}).click();await page.locator('.source-box').first().locator('input[type=file]').setInputFiles({name:'job.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
 await expect(page.getByRole('dialog')).toContainText('一時的な読取エラー');await page.getByRole('button',{name:'AIで再試行',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.source-box').first().getByText('読取テキストを確認・編集').click();await expect(page.locator('.source-box').first().locator('details textarea')).toHaveValue(text);expect(calls).toBe(2);
});
test('a delayed import result cannot attach to a new applicant',async({page})=>{
 let release,started;const pending=new Promise(r=>release=r),began=new Promise(r=>started=r);
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,loginRequired:false}}));
 await page.route('**/api/extract',r=>r.fulfill({json:{text:'original applicant source',textReady:true,pages:[],photos:[],warnings:[]}}));
 await page.route('**/api/assist',async r=>{started();await pending;return r.fulfill({json:{mode:'gemini',data:{name:'別の応募者の氏名'},warnings:[]}});});
 await page.goto('/');await page.getByLabel('氏名',{exact:true}).fill('最初の応募者');await expect(page.locator('.save-status')).toContainText('保存済み');
 await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'original.txt',mimeType:'text/plain',buffer:Buffer.from('fixture')});await began;
 // Exercise a state change while an asynchronous callback is outstanding.
 await page.getByRole('button',{name:'新しい書類',exact:true}).evaluate(b=>b.click());await page.locator('.new-options button').first().evaluate(b=>b.click());await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('');
 release();await expect(page.getByText('応募者が変更されたため、読取結果は反映していません。')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('');
});

test('exhausted rate limits show a friendly status without an error dialog or data loss',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true,aiSettings:{mode:'gemini-groq'}}}));
 await page.route('**/api/assist',r=>r.fulfill({status:502,json:{error:'provider quota detail',code:'GROQ_QUOTA_EXCEEDED'}}));
 await page.goto('/');await page.getByLabel('氏名',{exact:true}).fill('保持する氏名');
 await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'rate-test.txt',mimeType:'text/plain',buffer:Buffer.from('氏名：保持する氏名')});
 await expect(page.getByRole('status').filter({hasText:'AIが混み合っています'})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('保持する氏名');
 await expect(page.locator('.file-chip').filter({hasText:'rate-test.txt'})).toBeVisible();
});

test('education admission and graduation display on separate dated preview rows',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true}}));
 await page.route('**/api/assist',r=>r.fulfill({json:{mode:'gemini',warnings:[],data:{education:[{name:'テスト大学',date:'2012-04',end:'2016-03'}]}}}));
 await page.goto('/');await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'education.txt',mimeType:'text/plain',buffer:Buffer.from('テスト大学 2012年4月入学 2016年3月卒業')});
 await page.getByRole('button',{name:'選択した項目を反映'}).click();
 const rows=page.locator('.paper-stage .mhlw-row');
 await expect(rows.filter({hasText:'テスト大学　入学'})).toHaveCount(1);
 await expect(rows.filter({hasText:'テスト大学　卒業'})).toHaveCount(1);
 await expect(rows.filter({hasText:'テスト大学　入学'})).toContainText('2012');
 await expect(rows.filter({hasText:'テスト大学　卒業'})).toContainText('2016');
});

test('one school has two editable dates and preferences start with an editable default',async({page})=>{
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'gemini',geminiConfigured:true}}));
 await page.route('**/api/assist',r=>r.fulfill({json:{mode:'gemini',warnings:[],data:{education:[{name:'Pioneers multiple campus (大学)',date:'2018-02'},{name:'Pioneers multiple campus (大学)',date:'2022-04'}]}}}));
 await page.goto('/');await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'education.txt',mimeType:'text/plain',buffer:Buffer.from('大学 2018年入学 2022年卒業')});
 await page.getByRole('button',{name:'選択した項目を反映'}).click();
 await page.getByRole('button',{name:'2 学歴',exact:true}).click();
 await expect(page.locator('.repeat-card')).toHaveCount(1);
 await expect(page.getByLabel('学校名・学部',{exact:true})).toHaveValue('Pioneers multiple campus (大学)');
 await expect(page.getByLabel('入学年月',{exact:true})).toHaveValue('2018-02');
 await expect(page.getByLabel('卒業年月',{exact:true})).toHaveValue('2022-04');
 await page.getByLabel('卒業年月',{exact:true}).fill('2023-03');
 const rows=page.locator('.paper-stage .mhlw-row');await expect(rows.filter({hasText:'Pioneers multiple campus (大学)　卒業'})).toContainText('2023');
 await page.getByRole('button',{name:'6 本人希望',exact:true}).click();
 await expect(page.getByLabel('本人希望記入欄',{exact:true})).toHaveValue('貴社の規定に従います');
 await page.getByLabel('本人希望記入欄',{exact:true}).fill('勤務地は東京都内を希望します。');
 await expect(page.locator('.paper-stage')).toContainText('勤務地は東京都内を希望します。');
});
test('CV pages are not selected as photos and dragging a photo anywhere in the dialog works',async({page})=>{
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1kAAAAASUVORK5CYII=';
 await page.route('**/api/status',r=>r.fulfill({json:{assistMode:'local'}}));
 await page.route('**/api/extract',r=>r.fulfill({json:{text:'原本',pages:[image],photos:[],warnings:[]}}));
 await page.route('**/api/assist',r=>r.fulfill({json:{mode:'local',data:{name:'山田 太郎'},warnings:[]}}));
 await page.goto('/');await page.locator('.editor-content input[type=file]').first().setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from('test')});
 await page.getByRole('button',{name:'選択した項目を反映'}).click();
 await page.getByRole('button',{name:'証明写真 写真を追加 3 : 4'}).click();
 await expect(page.getByAltText('切り抜く写真')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'この写真を使用'})).toBeDisabled();
 await page.getByText('原本から写真部分を手動で切り抜く',{exact:true}).click();
 await page.getByAltText('切り抜き用原本 1').click();
 await expect(page.getByRole('button',{name:'この写真を使用'})).toBeDisabled();
 const transfer=await page.evaluateHandle(data=>{const raw=atob(data.split(',')[1]);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'portrait.png',{type:'image/png'}));return transfer;},image);
 await page.locator('.photo-drop-surface').dispatchEvent('drop',{dataTransfer:transfer});
 await expect(page.getByAltText('切り抜く写真')).toBeVisible();
 await expect(page.getByRole('button',{name:'この写真を使用'})).toBeEnabled();
 await page.getByRole('button',{name:'この写真を使用'}).click();await expect(page.getByAltText('応募者の証明写真')).toBeVisible();
 await page.locator('.photo-upload').dispatchEvent('drop',{dataTransfer:transfer});
 await expect(page.getByAltText('切り抜く写真')).toBeVisible();
 await expect(page.getByRole('button',{name:'この写真を使用'})).toBeEnabled();
});
