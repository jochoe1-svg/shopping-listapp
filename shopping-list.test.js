const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file:///' + path.resolve(__dirname, 'shopping-list.html').replace(/\\/g, '/');

let passed = 0;
let failed = 0;

function log(msg) { console.log(msg); }
function ok(label) { passed++; log(`  ✅ PASS: ${label}`); }
function fail(label, err) { failed++; log(`  ❌ FAIL: ${label}\n       ${err}`); }

async function assert(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();

  await page.goto(FILE_URL);
  await page.evaluate(() => localStorage.removeItem('shoppingList'));
  await page.reload();

  log('\n========================================');
  log(' 쇼핑 리스트 앱 자동 테스트 시작');
  log('========================================\n');

  log('📌 [1] 아이템 추가 테스트');

  await assert('빈 입력 시 추가 안 됨', async () => {
    await page.click('button:has-text("추가")');
    const count = await page.locator('li').count();
    if (count !== 0) throw new Error(`아이템이 추가됨 (count=${count})`);
  });

  await assert('"사과" 추가', async () => {
    await page.fill('#itemInput', '사과');
    await page.click('button:has-text("추가")');
    const count = await page.locator('li').count();
    if (count !== 1) throw new Error(`아이템 수 불일치 (expected 1, got ${count})`);
    const text = await page.locator('li span').first().textContent();
    if (text !== '사과') throw new Error(`텍스트 불일치 (expected "사과", got "${text}")`);
  });

  await assert('"바나나" Enter 키로 추가', async () => {
    await page.fill('#itemInput', '바나나');
    await page.keyboard.press('Enter');
    const count = await page.locator('li').count();
    if (count !== 2) throw new Error(`아이템 수 불일치 (expected 2, got ${count})`);
  });

  await assert('"우유" 추가', async () => {
    await page.fill('#itemInput', '우유');
    await page.click('button:has-text("추가")');
    const count = await page.locator('li').count();
    if (count !== 3) throw new Error(`아이템 수 불일치 (expected 3, got ${count})`);
  });

  await assert('추가 후 입력창 초기화', async () => {
    const val = await page.inputValue('#itemInput');
    if (val !== '') throw new Error(`입력창이 비워지지 않음 (value="${val}")`);
  });

  await assert('요약 텍스트 표시', async () => {
    const summary = await page.locator('#summary').textContent();
    if (!summary.includes('3')) throw new Error(`요약에 3이 없음: "${summary}"`);
  });

  log('\n📌 [2] 체크(완료) 기능 테스트');

  await assert('첫 번째 아이템 체크', async () => {
    await page.locator('li input[type="checkbox"]').first().check();
    const isChecked = await page.locator('li input[type="checkbox"]').first().isChecked();
    if (!isChecked) throw new Error('체크박스가 체크되지 않음');
  });

  await assert('체크된 아이템에 취소선 적용', async () => {
    const decoration = await page.locator('li.checked span').first().evaluate(
      el => getComputedStyle(el).textDecoration
    );
    if (!decoration.includes('line-through')) throw new Error(`취소선 없음: ${decoration}`);
  });

  await assert('완료 항목 삭제 버튼 표시', async () => {
    const visible = await page.locator('#clearBtn').isVisible();
    if (!visible) throw new Error('clearBtn이 보이지 않음');
  });

  await assert('요약에 완료 1개 반영', async () => {
    const summary = await page.locator('#summary').textContent();
    if (!summary.includes('1')) throw new Error(`요약에 1이 없음: "${summary}"`);
  });

  await assert('체크 해제 동작', async () => {
    await page.locator('li input[type="checkbox"]').first().uncheck();
    const isChecked = await page.locator('li input[type="checkbox"]').first().isChecked();
    if (isChecked) throw new Error('체크박스가 해제되지 않음');
  });

  log('\n📌 [3] 아이템 삭제 테스트');

  await assert('첫 번째 아이템(우유) 삭제', async () => {
    const beforeCount = await page.locator('li').count();
    await page.locator('li button[title="삭제"]').first().click();
    const afterCount = await page.locator('li').count();
    if (afterCount !== beforeCount - 1)
      throw new Error(`삭제 후 수 불일치 (expected ${beforeCount - 1}, got ${afterCount})`);
  });

  await assert('삭제 후 목록 2개 남음', async () => {
    const count = await page.locator('li').count();
    if (count !== 2) throw new Error(`아이템 수 불일치 (expected 2, got ${count})`);
  });

  log('\n📌 [4] 완료 항목 일괄 삭제 테스트');

  await assert('모든 아이템 체크', async () => {
    const checkboxes = page.locator('li input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) await checkboxes.nth(i).check();
    const checkedCount = await page.locator('li.checked').count();
    if (checkedCount !== count) throw new Error(`체크된 항목 수 불일치 (${checkedCount}/${count})`);
  });

  await assert('완료 항목 일괄 삭제', async () => {
    await page.locator('#clearBtn').click();
    const count = await page.locator('li').count();
    if (count !== 0) throw new Error(`삭제 후 아이템이 남음 (count=${count})`);
  });

  await assert('빈 목록 메시지 표시', async () => {
    const visible = await page.locator('#empty').isVisible();
    if (!visible) throw new Error('빈 목록 메시지가 보이지 않음');
  });

  await assert('완료 항목 삭제 버튼 숨김', async () => {
    const visible = await page.locator('#clearBtn').isVisible();
    if (visible) throw new Error('clearBtn이 여전히 보임');
  });

  log('\n📌 [5] localStorage 영속성 테스트');

  await assert('데이터 저장 후 새로고침 시 유지', async () => {
    await page.fill('#itemInput', '오렌지');
    await page.click('button:has-text("추가")');
    await page.reload();
    const count = await page.locator('li').count();
    if (count !== 1) throw new Error(`새로고침 후 아이템 수 불일치 (expected 1, got ${count})`);
    const text = await page.locator('li span').first().textContent();
    if (text !== '오렌지') throw new Error(`새로고침 후 텍스트 불일치: "${text}"`);
  });

  log('\n========================================');
  log(` 테스트 완료: ${passed} 통과 / ${failed} 실패`);
  log('========================================\n');

  await browser.close();

  if (failed > 0) process.exit(1);
})();