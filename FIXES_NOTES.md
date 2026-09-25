# Ghi chú các fix đã áp dụng (session tổng hợp)

Tài liệu này ghi lại các lỗi đã phát hiện và fix trong quá trình review cho **SimpleMDG version
1.7.0**, làm việc với các testsuite Playwright của dự án `core_v17_s4_qas`. Dùng làm checklist để
áp dụng lại cho các dự án tương tự dùng chung các testsuite/pattern này.

File này được cập nhật ngay mỗi khi có fix mới trong đợt review — không gộp/rời rạc ở nơi khác.

## Cách dùng file này cho 1 dự án mới

Nội dung được nhóm theo **chủ đề nguyên nhân** (không theo thứ tự thời gian phát hiện) để dễ áp
dụng lại. Mức độ áp dụng lại khác nhau theo nhóm:

- **Nhóm A (Timing & Polling), B (Dialog/Tab lifecycle), C (Locator & Assertion), F (Phương pháp
  debug)** — áp dụng được ngay cho hầu hết dự án Playwright + SAPUI5 khác, vì đây là các pattern
  chung của UI5 (busy indicator, dialog/backdrop, IconTabBar, web-first assertion...), không đặc
  thù riêng SimpleMDG.
- **Nhóm D (giới hạn dữ liệu)** — chỉ tham khảo CÁCH làm (đặt clamp tại 1 điểm trung tâm), KHÔNG
  copy nguyên số liệu (40 ký tự, 18 ký tự...) — phải xác nhận lại giới hạn thật của hệ thống đích.
- **Nhóm E (lỗi call-site)** — chỉ là 1 ví dụ cụ thể, giá trị chính nằm ở cách CHẨN ĐOÁN (kiểm tra
  call site trước khi nghi ngờ page object dùng chung).

Mỗi mục theo format: **Triệu chứng → Nguyên nhân → Fix (cuối cùng, đặt lên đầu để copy ngay) →
Phạm vi áp dụng**. Một số mục có thêm phần **"Lịch sử các bản fix sai trước đó"** — không bắt buộc
đọc để áp dụng lại, nhưng hữu ích khi 1 fix "nhìn có vẻ đúng" vẫn tiếp tục fail và cần hiểu vì sao
các hướng đơn giản hơn đã không đủ.

## Mục lục theo chủ đề

- **Nhóm A — Timing & Polling** (chờ backend/UI xử lý, busy indicator, timeout không nhất quán):
  [Mục 4](#mục-4), [Mục 5](#mục-5), [Mục 6](#mục-6), [Mục 7](#mục-7), [Mục 8](#mục-8),
  [Mục 10](#mục-10), [Mục 11](#mục-11), [Mục 15](#mục-15)
- **Nhóm B — Dialog / Popup / Tab lifecycle** (chưa đóng hẳn, chưa swap hẳn trước hành động sau):
  [Mục 12](#mục-12), [Mục 16](#mục-16)
- **Nhóm C — Locator & Assertion đúng chuẩn Playwright**: [Mục 9](#mục-9), [Mục 14](#mục-14)
- **Nhóm D — Giới hạn dữ liệu đặc thù SimpleMDG** (chỉ tham khảo cách làm): [Mục 1](#mục-1),
  [Mục 2](#mục-2), [Mục 3](#mục-3)
- **Nhóm E — Lỗi call-site** (không phải bug trong page object dùng chung): [Mục 13](#mục-13)
- **Nhóm F — Phương pháp debug flaky test**: [xem cuối file](#nhóm-f--phương-pháp-debug-flaky-test)
- [Checklist tổng hợp theo nhóm](#checklist-tổng-hợp-theo-nhóm)

---

# Nhóm A — Timing & Polling

Nhóm lỗi lớn nhất trong đợt review: code chờ theo **fixed timeout** hoặc **check tức thời** thay
vì chờ theo tín hiệu thực tế của app (busy indicator, actionability, polling), nên dưới tải cao
(CI/Automation Hub, nhiều test chạy song song) sẽ timeout dù bản chất app chỉ đang "chưa xong",
không phải lỗi hạ tầng/mạng.

## Mục 4

### Flaky test khi chạy trên CI/Automation Hub (headless) — search button trong My Inbox

**Triệu chứng:** Test pass ổn định khi chạy ở terminal (local, headed hoặc ít tải), nhưng
fail/flaky khi chạy qua CI (Automation Hub, headless, tải nặng hơn) với lỗi:

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
  - element is not stable
  - element is not visible
```

Tại locator `[id$="myInboxSearch-search"]`.

**Nguyên nhân gốc:** Nút search trong SAPUI5 SearchField được render là 1 `<div>`
(không phải `<button>` thật). Ngay sau khi `.fill()` giá trị vào ô input, SAPUI5 tự
re-render nút này (đổi icon "search" ↔ "clear"), tạo ra 1 khoảng thời gian element bị
tháo/gắn lại DOM. Trên máy nhẹ/local, khoảng thời gian này rất ngắn nên Playwright kịp
click; trên môi trường CI tải nặng hơn, cửa sổ này rộng ra đủ để `locator.click()` liên tục
gặp "not stable"/"not visible" rồi timeout.

**Fix:** Thay `searchBtn.click()` bằng `searchField.press('Enter')` — SAPUI5 SearchField đã
bind sẵn sự kiện tìm kiếm theo phím Enter, không cần nhắm vào một element đang tự re-render.
Đây cũng là pattern đã tồn tại sẵn (ổn định) ở `pages/verify/MainVisibleRuleVerifyPage.ts`
trong cùng dự án — dùng nó làm chuẩn tham chiếu.

```ts
// TRƯỚC
await searchField.fill(crNumber);
const searchBtn = this.page.locator('[id$="myInboxSearch-search"]');
await expect(searchBtn).toBeVisible({ timeout: 10000 });
await searchBtn.click();

// SAU
await searchField.fill(crNumber);
// Press Enter thay vì click icon search — icon này tự re-render ngay sau fill()
// (rỗng -> icon clear), dễ flaky khi chạy headless/CI tải nặng.
await this.page.waitForTimeout(300); // để UI5 kịp settle sau fill (không bắt buộc ở mọi chỗ)
await searchField.press('Enter');
```

**Danh sách file/method đã fix trong dự án gốc** (đều theo cùng 1 pattern
`fill()` rồi `[id$="myInboxSearch-search"].click()`):

| File | Method(s) |
|---|---|
| `pages/cr/MyInboxPage.ts` | `searchCR()`, `verifyCRLeft()` |
| `pages/actions/ApproverActions.ts` | `search()`, `verifyCRLeft()`, `acceptDuplication()` |
| `pages/mass/MassInboxPage.ts` | `searchCR()`, `verifyCRLeft()`, `acceptDuplicateApprover()` (2 chỗ) |
| `pages/cr/MulProcessPage.ts` | `searchInInbox()` |

**Phạm vi áp dụng:**
- Grep toàn bộ project theo pattern `myInboxSearch-search` (hoặc bất kỳ locator search-icon
  nào tương tự trong SAPUI5) → kiểm tra có đang `.click()` ngay sau `.fill()` hay không.
- Đổi tất cả sang `.press('Enter')` trên chính locator input (không cần thêm biến `searchBtn`
  riêng — xóa luôn biến không dùng nữa để tránh lint warning).
- Đây là fix mang tính hệ thống (root cause ở tầng UI5 rendering), nên áp dụng đồng loạt cho
  MỌI chỗ có pattern này trong project, không chỉ riêng testcase đang bị báo lỗi — vì các
  testcase khác dùng chung các page object này cũng tiềm ẩn cùng 1 rủi ro flaky, chỉ là chưa
  bị lộ ra trên CI.
- Lưu ý: field `[id$="searchField-search"]` trong `pages/actions/AdminActions.ts` (dialog F4
  search) là 1 control KHÁC (search trong dialog, không phải toolbar My Inbox) — chưa xác
  nhận có cùng vấn đề flaky hay không, cần test riêng trước khi áp dụng fix tương tự.

---

## Mục 5

### Attachments: verify bị fail/flaky do "app xử lý chậm" (SPA render + backend search + toast)

Ba lỗi độc lập nhưng cùng một nhóm nguyên nhân — code chờ theo **fixed timeout** thay vì
poll theo trạng thái thực tế của app, nên dưới tải cao (nhiều thao tác attachment liên tiếp,
backend search chậm...) sẽ timeout dù bản chất là "chưa xong" chứ không phải "network chết".

### 5a. Mở CR detail từ list không có retry/reload (giống lỗi mục 4 nhưng ở chỗ khác)

**Triệu chứng:** `Timed out 30000ms waiting for expect(locator).toBeVisible() — Label 'Material Number'`
ngay sau khi click CR link từ My Request list, dù CR đã ở đúng status.

**Nguyên nhân:** Cùng lớp lỗi "SPA detail route render intermittent" đã fix ở
`MyInboxPage.openCRDetail()` (xem mục 4), nhưng `helpers/attachment/attachment.ts` có 3 hàm
(`verifyAttachmentsAfterSubmit`, `verifyAttachmentsAfterActivate`, `verifyAttachmentsAfterReject`)
tự làm `click CR link → expect label` **không có retry/reload** — chỉ cần route bị treo 1 lần
là fail thẳng, không có cơ hội tự phục hồi.

**Fix v1 (có 1 lỗi, xem cảnh báo bên dưới):** Gom logic vào 1 helper nội bộ dùng chung
`_openCRDetailFromList()` với pattern retry+reload (3 attempt, reload giữa các attempt), rồi
cho cả 3 hàm gọi lại helper này thay vì tự viết click+expect riêng lẻ.

**⚠️ Bug phát sinh từ chính fix v1 ở trên (đã tự gặp lại ngay lần chạy tiếp theo):**
`page.reload()` chỉ reload lại đúng URL/route **hiện tại** — nếu click CR link đã thành công
điều hướng sang trang **detail** (chỉ là label chưa kịp render), thì sau `reload()` ta vẫn đang
ở trang **detail**, KHÔNG quay lại trang **list**. Ở attempt kế tiếp, code lại cố click CR link
— nhưng link đó chỉ tồn tại ở trang list → `locator.click()` không tìm thấy element, chờ hết
timeout mặc định (10s) rồi fail với lỗi hoàn toàn khác (`TimeoutError: locator.click`) thay vì
lỗi label ban đầu. Nói cách khác: **reload() chỉ đúng khi ta chắc chắn vẫn đang ở đúng route
cần re-render** (như trường hợp `MyInboxPage.openCRDetail()` — nơi luôn `page.goto(hash)` tới
1 URL cố định nên reload luôn về đúng chỗ); nó SAI khi việc điều hướng ban đầu là click 1 link
chỉ tồn tại trên 1 trang khác (list), vì sau reload trang đó có thể không còn nữa.

**Fix v2 (đúng):** Trước khi click, kiểm tra CR link có đang hiển thị hay không — nếu có (đang
ở list, hoặc lần đầu vào) thì click; nếu không (đã ở trang detail do lần click trước đã thành
công, chỉ là chưa render xong) thì bỏ qua bước click, chỉ chờ lại label. Cách này tự thích ứng
với cả 2 tình huống mà không cần biết trước reload sẽ đưa mình về đâu.

```ts
async function _openCRDetailFromList(page: Page, crNumber: string, confirmLabel = 'Material Number'): Promise<void> {
  const label = page.getByRoleUI5('Label', { text: confirmLabel }).first();
  const crLink = page.getByRoleUI5('Link', { text: crNumber }).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Chỉ click nếu link đang thực sự hiển thị — sau reload có thể đã ở trang
    // detail (không còn link) hoặc quay lại list (link tái xuất hiện), cách
    // check này tự đúng cho cả 2 trường hợp.
    if (await crLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await crLink.click();
    }
    if (await label.isVisible({ timeout: 30000 }).catch(() => false)) return;
    if (attempt < 3) {
      await page.reload().catch(() => {});
      await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
    }
  }
  throw new Error(`Failed to open CR detail for ${crNumber} after 3 attempts`);
}
```

**⚠️ Bug v2 vẫn còn (phát hiện qua chạy thực tế lần tiếp theo — kèm trace + screenshot):**
`page.reload()` KHÔNG phải lúc nào cũng "ép SPA render lại sạch" — với app này, reload đã khiến
trang **trắng hoàn toàn vĩnh viễn** (xác nhận qua screenshot lúc fail) và không tự phục hồi ở cả
3 attempt. Xem trace (`npx playwright show-trace`) cho thấy console log có
`[FUTURE FATAL] ...: The registered Event Listener 'init' must not have a return value` — dấu
hiệu app này có thể fragile khi phải bootstrap lại toàn bộ (full reload), khác với việc điều
hướng nội bộ qua router/hash (như click tab, click link) vốn không cần bootstrap lại từ đầu.
Khác biệt với `MyInboxPage.openCRDetail()`: ở đó **mỗi attempt đều `page.goto(hash)` tới 1 URL
cụ thể** trước khi check label — `reload()` trong đó chỉ là lớp bảo hiểm phụ, không phải cơ chế
phục hồi chính. `_openCRDetailFromList()` không có 1 URL cố định để `goto()` lại, nên dựa hẳn
vào `reload()` là rủi ro thật sự (đã xảy ra), không phải giả thuyết.

**Fix v3 (bỏ reload — vẫn còn thiếu 1 bước):** Bỏ hẳn `page.reload()`. Thay bằng
click lại tab "My Request" để quay về list qua router nội bộ (điều hướng nhẹ, không bootstrap
lại toàn app) — giống `RequestorActions.cancelFromDetail()`.

**⚠️ Bug v3 vẫn còn (phát hiện qua chạy thực tế lần thứ 3 — kèm screenshot mới):** Screenshot
lúc fail lần này cho thấy đang **đúng tab "My Request"** (tab được highlight, không phải trang
trắng nữa) nhưng **bảng danh sách CR hoàn toàn rỗng — không có row nào**. Nguyên nhân: click lại
tab chỉ đưa đúng TRANG, nhưng KHÔNG re-search — danh sách vẫn giữ (hoặc mất) bộ lọc search cũ,
không có kết quả nào cho `crNumber`, nên đương nhiên không có CR link để click. Quan trọng hơn:
lỗi này xảy ra ngay từ **attempt 1** (trước khi bất kỳ recovery nào chạy) — nghĩa là list đã rỗng
ngay từ đầu, ngay sau khi `waitForStatus`/`verifyStatus` (helpers/workflow) xác nhận SUBMITTED
xong. Rút ra: **hàm mở CR detail không nên phụ thuộc vào bất kỳ trạng thái search/list nào mà
caller để lại** — vì các luồng Edit → Resubmit có thể để list ở trạng thái không có filter đúng.

**Fix v4 (đúng, đã xác nhận qua screenshot):** `_openCRDetailFromList()` tự chủ hoàn toàn — ở
MỌI attempt (kể cả attempt 1), luôn tự click tab "My Request" RỒI search lại `crNumber` bằng
đúng field/helper mà `MyRequestPage` dùng (`[id$="requestHistorySearchField-I"]` +
`searchAndClick()`), không bao giờ giả định list đã có sẵn kết quả đúng.

```ts
for (let attempt = 1; attempt <= 3; attempt++) {
  await page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).first().click().catch(() => {});
  await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 }).catch(() => {});
  if (await searchField.isVisible({ timeout: 10000 }).catch(() => false)) {
    await searchAndClick(page, searchField, crNumber);   // fill + click search button
    await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  if (await crLink.isVisible({ timeout: 10000 }).catch(() => false)) {
    await crLink.click();
  }
  if (await label.isVisible({ timeout: 30000 }).catch(() => false)) return;
}
```

**⚠️ Bug v4 vẫn còn (phát hiện qua chạy thực tế lần thứ 4):** Tự viết `click tab + search tay`
(thay vì dùng `MyRequestPage`) đã đụng lại đúng 2 vấn đề mà các page object trong project ĐÃ xử
lý sẵn nhưng bị bỏ sót khi tự tái tạo logic:
1. Click tab bị `#sap-ui-blocklayer-popup` chặn pointer events (`locator.click: Timeout 10000ms
   exceeded ... subtree intercepts pointer events`) — `BasePage.navigateTo()` đã có sẵn retry
   5 lần + `waitForPopupClosed()` xử lý đúng việc này, nhưng code tự viết chỉ click 1 lần và
   nuốt lỗi (`.catch(() => {})`).
2. Sau khi click tab, search field khôi phục với **giá trị CŨ của 1 CR hoàn toàn khác**
   (`value="CR0000010080"` — không liên quan gì tới CR đang test) — dấu hiệu SAPUI5 đang phục
   hồi lại 1 view đã được "preserve" (cache) từ trước, không phải view mới/sạch.

**Fix v5 (đúng — dùng lại thay vì tái tạo):** Thay vì tự viết `click tab` + `searchAndClick`
thủ công trong `attachment.ts`, gọi thẳng `MyRequestPage.goto()` + `.searchCRForVerify()` —
đúng 2 method mà **chính spec này đã dùng thành công ở Phase 2** (`myRequest.goto()` +
`myRequest.searchCRForVerify(newCR)`, xem log: `[MyRequest] CR row found: ...`). `goto()` nội
bộ gọi `navigateTo()` (có retry+`closeBlockingPopup()`) nên tự động thừa hưởng toàn bộ độ bền đã
được kiểm chứng, thay vì viết lại (yếu hơn) cùng logic đó.

```ts
const myRequest = new MyRequestPage(page);
for (let attempt = 1; attempt <= 3; attempt++) {
  await myRequest.goto();
  await myRequest.searchCRForVerify(crNumber);
  if (await crLink.isVisible({ timeout: 10000 }).catch(() => false)) {
    await crLink.click();
  }
  if (await label.isVisible({ timeout: 30000 }).catch(() => false)) return;
}
```

**⚠️ Bug v5 vẫn còn (phát hiện qua chạy thực tế lần thứ 5 — cuối cùng đối chiếu với testcase
tương tự thay vì tiếp tục tự sửa mù):** Sau fix v5, `myRequest.goto()` + `.searchCRForVerify()`
chạy thành công MỌI lần (log `[MyRequest] CR row found` xuất hiện ổn định ở cả 3 attempt), nhưng
`"Material Number"` vẫn không bao giờ hiện ra. Nghĩa là vấn đề không còn ở việc SEARCH/list nữa —
mà ở đúng bước **click CR link → verify label** phía sau, thứ mà tôi tự viết tay và không hề
đối chiếu với các testcase khác đã pass ổn định trong cùng suite.

So sánh với `att-e2e-mm-04-submit-duplicate-edit-resubmit-cancel.spec.ts` — có flow **giống hệt**
(Edit → Resubmit → `verifyAttachmentsAfterSubmit`) và test này pass — phát hiện ra
`pages/cr/MyRequestPage.ts` đã có sẵn method `openCRDetailForVerify()` với doc comment nói thẳng
đúng root cause: *"The My Request search table can re-render right after a search; a click fired
at that moment can be swallowed (no navigation happens, the page stays on the list)"*. Cách xử lý
đã có sẵn:
1. **Chờ table settle TRƯỚC KHI CLICK** (`waitForBusy(30000)` + `waitForTimeout(1500)`) — bước
   này hoàn toàn vắng mặt trong mọi bản tự viết (`_openCRDetailFromList`) của tôi từ v1 đến v5.
2. Xác nhận trang detail đã load bằng **`page.locator('bdi').filter({ hasText: confirmLabel })`**
   — KHÔNG PHẢI `getByRoleUI5('Label', { text: confirmLabel })` mà tôi dùng suốt từ đầu. Label UI5
   và `<bdi>` là 2 phần tử khác nhau trên cùng màn hình; `bdi` mới là locator đã được kiểm chứng ổn
   định (dùng lại ở cả `MyInboxPage.openCRDetail()` lẫn `openCRDetailForVerify()`).

**Fix v6 (đúng, đối chiếu trực tiếp với testcase tương tự đã pass):** Bỏ hẳn toàn bộ
`_openCRDetailFromList` tự viết, gọi thẳng method có sẵn:

```ts
async function _openCRDetailFromList(page: Page, crNumber: string, confirmLabel = 'Material Number'): Promise<void> {
  await new MyRequestPage(page).openCRDetailForVerify(crNumber, confirmLabel);
}
```

`openCRDetailForVerify()` tự lo toàn bộ: goto + search + chờ settle + click scoped vào đúng row +
verify qua `bdi` + retry 3 lần nội bộ — không còn cần viết thêm bất kỳ logic retry/điều hướng nào
ở tầng `attachment.ts` nữa.

**Bài học áp dụng lại (quan trọng nhất — rút ra sau cả chuỗi fix v1→v6, xem thêm [Nhóm
F](#nhóm-f--phương-pháp-debug-flaky-test)):**
- **Khi 1 fix tự viết liên tục fail qua nhiều vòng dù logic "có vẻ đúng", hãy DỪNG LẠI và tìm 1
  testcase khác trong cùng suite có flow tương tự đang PASS ổn định, rồi đối chiếu từng bước xem
  nó gọi API nào khác với bản tự viết** — đây là cách nhanh nhất để lộ ra sai lệch nhỏ nhưng chí
  mạng (ở đây: 1 locator xác nhận trang load sai loại phần tử, và thiếu đúng 1 dòng "chờ settle
  trước khi click" mà không cách nào đoán ra được nếu chỉ nhìn code tự viết một mình).
- **Đừng tự viết lại (yếu hơn) 1 thao tác điều hướng/search mà project đã có sẵn page object xử
  lý ổn định.** Trước khi tự viết `click` + `fill` + `waitForSelector` thủ công cho 1 hành vi
  "quen thuộc" (mở tab, search list...), grep xem đã có method nào trong `pages/*.ts` làm đúng
  việc này chưa — nếu có, gọi lại nó (kể cả từ 1 helper ở thư mục khác, `new PageObject(page)`
  không tốn kém). Việc tự viết lại thường bỏ sót các edge case (blocklayer, popup, cached view)
  mà method gốc đã phải vá qua nhiều lần trước đó.
- Một hàm "mở CR detail" dùng lại được ở nhiều nơi (nhiều phase, nhiều luồng gọi trước đó khác
  nhau: sau submit, sau resubmit, sau activate, sau reject...) **không nên giả định trạng thái
  list/search mà caller để lại** — mỗi luồng gọi trước có thể để list ở 1 trạng thái filter khác
  nhau (hoặc rỗng). Hàm nên **tự search lại từ đầu**, biến nó thành một hành động độc lập, idempotent
  — luôn cho ra cùng kết quả bất kể được gọi từ đâu.
- Khi viết retry-by-reload, luôn tự hỏi: "sau `reload()`, mình chắc chắn đang ở route nào, và
  app có đảm bảo bootstrap lại thành công từ 1 deep-link/reload hay không?" Nếu không chắc chắn
  (và không có cách kiểm tra trước), **ưu tiên điều hướng qua router nội bộ của app (click tab,
  click breadcrumb...) thay vì `page.reload()`** — nhẹ hơn, không bootstrap lại toàn bộ, và ít
  rủi ro "kẹt trắng vĩnh viễn" hơn nhiều. Chỉ dùng `page.reload()`/`page.goto()` làm cơ chế phục
  hồi chính khi đã xác nhận (qua trace/log) rằng full reload của app này thực sự ổn định.
- **Luôn xem trace + screenshot khi 1 fix "chắc chắn đúng về mặt logic" vẫn fail** — logic của
  fix v2 (chỉ click khi link hiển thị) hoàn toàn hợp lý, nhưng giả định nền tảng của nó
  (reload() phục hồi được trạng thái) lại sai trong thực tế. Không có trace/screenshot sẽ rất
  khó phát hiện ra đây là "trang trắng vĩnh viễn" chứ không phải "chậm hơn bình thường".
- Khi đã tìm ra 1 pattern retry+reload hiệu quả cho 1 chỗ, **grep toàn
project** tìm các chỗ khác có cùng shape code (`click CR link` → `expect label visible`,
không có vòng lặp) — rất hay bị lặp lại y hệt ở nhiều helper/page object khác nhau vì được
copy-paste giữa các phase (Requestor/Approver/Steward).

### 5b. "Select from my files" — search backend chậm bị coi là "not found" rồi âm thầm bỏ qua

**Triệu chứng:** File hệ thống (vd `SA456.xlsx`) thỉnh thoảng "không tìm thấy" khi chọn qua
"Select from my files", nhưng chạy lại thì tìm thấy ngay lập tức (chứng tỏ không phải do sai
tên/logic, mà do timing).

**Nguyên nhân:** Code chỉ chờ `waitForTimeout(2000)` rồi `waitForTimeout(3000)` (retry 1 lần)
cho kết quả search trả về — đây là **thời gian chờ backend search xử lý**, không phải UI
animation, nên dễ không đủ khi backend chậm. Tệ hơn: khi vẫn không thấy, code chỉ log warning,
đóng dialog, rồi **`continue`** sang file kế tiếp — không throw lỗi. Hàm vẫn báo
"✅ All N file(s) verified" dù thực tế thiếu 1 file. Lỗi thật sự chỉ lộ ra rất muộn (ở phase
verify sau, thường là sau khi đã tốn nhiều phút submit + chờ status) với message gây hiểu lầm
("attachment link not found") — sai hẳn vị trí so với nguyên nhân gốc.

**Fix:** Thay `waitForTimeout` cố định bằng `expect(fileRow).toBeVisible({ timeout: 20000 })`
(chịu được backend chậm thật), và khi hết thời gian vẫn không thấy thì **throw ngay tại đây**
(kèm đóng dialog trước khi throw) thay vì `continue` âm thầm.

**Bài học áp dụng lại:** Bất kỳ chỗ nào code có pattern "nếu không tìm thấy sau N lần thử →
log warning → `continue`/bỏ qua → vẫn báo tổng kết thành công" đều là một nguồn lỗi tiềm ẩn
tương tự: nó biến 1 lỗi rõ ràng, dễ debug (fail ngay tại chỗ) thành 1 lỗi mơ hồ, fail muộn ở
chỗ khác. Nguyên tắc: **fail nhanh, fail đúng chỗ** — đừng nuốt lỗi rồi để hệ quả của nó lộ ra
ở một bước hoàn toàn khác.

### 5c. Toast xác nhận CR bị miss do timeout cứng, không theo busy indicator

**Triệu chứng:** `Timed out 20000ms waiting for expect(locator).toBeVisible() — CR\d{10}...`
khi đợi toast báo CR đã tạo — đôi khi xảy ra ngay ở lần submit CR đầu tiên (Phase 1), chứng tỏ
backend tạo CR chậm hơn bình thường (đặc biệt sau khi vừa xử lý nhiều thao tác attachment).

**Nguyên nhân:** `submitCRWithConfirm()` chỉ `waitForTimeout(2000)` cố định sau khi click Submit
rồi mới bắt đầu đợi toast (20s) — không có tín hiệu nào theo dõi app có đang xử lý (busy
indicator) hay không, nên tổng thời gian chờ không co giãn theo tải thực tế.

**Fix:** Thêm `waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })`
sau khi click Submit (trước khi đợi toast), và tăng timeout đợi toast từ 20s → 30s.

```ts
await page.getByRoleUI5('Button', { text: 'Submit' }).first().click();
await page.waitForTimeout(1000);
await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
const toastLocator = page.getByText(/CR\d{10}\s(is|has)/).first();
await expect(toastLocator).toBeVisible({ timeout: 30000 });
```

Đồng thời (fix trước đó, xem lại code hiện tại): bước dismiss toast bằng nút "OK" ngay sau đó
cũng cần best-effort (`{ timeout: 5000 }.catch(() => {})`) vì toast có thể tự ẩn trước khi kịp
click — đây chỉ là dọn giao diện, không phải bước bắt buộc để xác nhận CR đã tạo (CR number đã
lấy được từ text toast trước đó rồi). **Cập nhật ở [Mục 16](#mục-16):** riêng phần dismiss này
sau đó lại phải sửa tiếp — best-effort thuần túy không đủ, cần thêm `closeBlockingPopup()` để
không để lại blocklayer treo cho bước sau.

**Kết luận về network vs. app chậm:** Cả 2 lỗi 5a và 5c đều **không phải do mất kết nối mạng**
— trong log, CR vẫn được tạo/chuyển trạng thái đúng ở backend (`waitForCRStatus` vẫn thành công
sau đó), chỉ là **UI/backend xử lý chậm hơn khoảng thời gian cố định mà code đang chờ**. Dấu
hiệu phân biệt: nếu là mất mạng thật, các bước SAU đó (search CR, chờ status) cũng sẽ fail theo
kiểu network error rõ ràng (net::ERR_*, response abort...); ở đây các bước tiếp theo vẫn chạy
bình thường một khi qua được điểm nghẽn, và cùng 1 kịch bản chạy lại (retry) có xác suất pass —
đặc trưng của race condition do timeout cố định, không phải lỗi hạ tầng mạng.

---

## Mục 6

### Submit button vẫn "disabled" khi click — pass ở terminal, fail ở Automation Hub

**Triệu chứng:** `TimeoutError: locator.click ... element is not enabled` khi click nút Submit,
dù locator resolve đúng element (không phải "not found"). Pass ổn định ở terminal (local, ít
tải) nhưng fail ở Automation Hub (tải nặng hơn). Gặp cụ thể ở luồng save-draft → reopen → submit
(`e2e-mm-11-save-draft-resubmit-approve-activate.spec.ts`), nhưng root cause nằm ở hàm dùng
chung, nên có thể ảnh hưởng bất kỳ spec nào gọi `submitCRWithConfirm()` ngay sau 1 bước vừa
render/validate lại form (reopen draft, edit, resubmit...).

**Nguyên nhân:** Nút Submit tồn tại + visible nhưng vẫn **disabled** vì form chưa validate xong
(thường gặp ngay sau khi reopen 1 draft — dữ liệu cần vài trăm ms tới vài giây để re-validate).
`submitCRWithConfirm()` (`helpers/workflow/workflow.ts`) chỉ gọi `.click()` trần — Playwright chờ
theo actionability timeout MẶC ĐỊNH (ngắn), không có wait tường minh riêng cho "đang disabled chờ
validate". Ở terminal, form kịp validate xong trước khi code chạy tới click; ở môi trường tải
nặng hơn (Automation Hub), validate chưa xong → click miss.

Thêm vào đó, code gọi hàm này ở `e2e-mm-11` có 1 bước swallow lỗi đáng ngờ ngay trước khi submit:
```ts
await expect(page.getByRoleUI5('Label', { text: 'Product' }).first())
  .toBeVisible({ timeout: 10000 })
  .catch(() => { console.log('Product label not found, continuing anyway'); });
```
`.catch()` ở đây khiến code **luôn tiếp tục submit** dù form rõ ràng chưa load xong — cùng loại
"nuốt lỗi rồi vẫn báo thành công" đã gặp ở [Mục 5b](#5b-select-from-my-files--search-backend-chậm-bị-coi-là-not-found-rồi-âm-thầm-bỏ-qua).

**Fix:** Thêm `expect(submitButton).toBeEnabled({ timeout: 30000 })` TRƯỚC khi click, tại đúng 1
điểm trung tâm (`submitCRWithConfirm()`), bảo vệ mọi spec gọi hàm này:

```ts
// helpers/workflow/workflow.ts
const submitButton = page.locator('[id$="submitButton"]');
await expect(submitButton).toBeEnabled({ timeout: 30000 });
await submitButton.click();
```

**Bài học áp dụng lại:** Với các action quan trọng (Submit, Approve, Confirm...), đừng chỉ dựa
vào actionability timeout mặc định của `.click()` — assert tường minh `toBeEnabled()` (không chỉ
`toBeVisible()`) trước khi click, đặc biệt ngay sau 1 bước vừa load/re-render lại form (reopen
draft, edit, resubmit). "Element resolve được nhưng disabled" là dấu hiệu rõ ràng của validation
chưa xong — khác hẳn "not found"/"not visible", và cần 1 wait riêng chứ không tự khỏi nếu chỉ
tăng timeout chung chung.

---

## Mục 7

### Mass Activation: "DONE" timeout quá ngắn so với thời gian backend xử lý N item trùng lặp

**Triệu chứng:** Test đứng/timeout ở bước verify cuối cùng của Steward Round 2 (accept
duplicate), báo `Timed out 30000ms waiting for expect(locator).toBeVisible() —
ObjectStatus 'DONE'`. Screenshot lúc fail cho thấy **Progress: Processed Items 0/5** — toàn bộ
5 item vẫn còn `DUPLICATE`, chưa được xử lý gì cả sau 90s (60s busyWait + 30s expect).

**Nguyên nhân:** `MassActivationPage.acceptDuplicateStewardRound2()` chỉ chờ
`waitForBusy(60000)` rồi check `expect(ObjectStatus 'DONE').toBeVisible({ timeout: 30000 })` —
1 lần duy nhất, không polling. Backend xử lý lại (re-activate) N item trùng lặp sau khi Steward
accept duplicate là 1 tác vụ MASS (nhiều BP/Material record), có thể mất hơn 1-2 phút dưới tải,
xa hơn nhiều so với 90s tổng đang chờ. Đối chiếu `MassRequestPage.ts` (cùng loại "chờ DONE sau
accept duplicate" nhưng ở phase Requestor) đã dùng timeout **120000ms (2 phút)** cho đúng tình
huống này — xác nhận 30000ms ở `MassActivationPage.ts` là thiếu hụt rõ ràng so với chuẩn đã có
sẵn trong chính codebase, không phải do "chưa gặp bao giờ".

**Fix v1 (sai — dùng reload, đã tự gây ra lỗi mới):** Thay 1 lần
`expect().toBeVisible({ timeout: 30000 })` bằng vòng poll `waitForDoneStatus()` có `page.reload()`
mỗi vòng, giống shape poll của `waitForStatus()`/`waitForCRStatus()` nhưng dùng reload thay vì
re-search (vì đang ở trang chi tiết ACT, không phải list).

**⚠️ Bug v1 (phát hiện qua chạy thực tế — kèm screenshot):** `reload()` liên tục (mỗi 5s/lần,
tới hơn 10 lần trong lần chạy fail) cuối cùng khiến trang **vỡ thành trắng hoàn toàn** — đúng lớp
lỗi "SPA bootstrap fragility" đã ghi nhận ở [Mục 5a](#5a-mở-cr-detail-từ-list-không-có-retryreload-giống-lỗi-mục-4-nhưng-ở-chỗ-khác)
(`helpers/attachment/attachment.ts`). Một khi trang đã vỡ, status "DONE" không bao giờ được phát
hiện lại được nữa **dù backend đã xử lý xong thật** — vòng poll cứ tiếp tục chờ vô ích cho tới khi
hết `test.setTimeout` toàn cục và bị "Test was interrupted", tốn gần 5 phút chạy vô nghĩa.
`reload()` ở đây vừa **nặng** (mỗi lần phải boot lại toàn bộ SPA) vừa **không đáng tin cậy** cho
app này khi lặp lại nhiều lần — đúng như nhận định ban đầu.

**Fix v2 (đúng — bỏ reload, chỉ tăng thời gian chờ):** View chi tiết ACT tự phản ánh cập nhật
trạng thái backend theo thời gian mà KHÔNG cần reload (model/binding của SAPUI5 tự refresh) —
chỉ cần poll trên đúng DOM hiện tại với thời gian chờ đủ dài, không tương tác gì thêm với trang:

```ts
async waitForDoneStatus(crNumber: string, maxWaitMs = 240000): Promise<void> {
  const startTime = Date.now();
  let isDone = await this.page.getByRoleUI5('ObjectStatus', { text: 'DONE' }).first()
    .isVisible({ timeout: 5000 }).catch(() => false);
  while (!isDone) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) throw new Error(`CR ${crNumber} did not reach DONE after ${maxWaitMs / 1000}s`);
    await this.page.waitForTimeout(5000);
    isDone = await this.page.getByRoleUI5('ObjectStatus', { text: 'DONE' }).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
  }
}
```

**Bài học áp dụng lại:**
- `acceptDuplicateSteward()`/`acceptDuplicateStewardRound2()` chỉ định nghĩa 1 lần trong
  `pages/mass/MassActivationPage.ts` nhưng được dùng chung bởi **6 testcase** trên cả 2 suite
  `S4_QAS_MASS_DUP_BP01` và `S4_QAS_MASS_DUP_MM01` (grep `acceptDuplicateStewardRound2` để xác
  nhận) — sửa đúng 1 chỗ này bảo vệ toàn bộ.
- Với các bước "chờ trạng thái cuối cùng sau 1 tác vụ MASS xử lý nhiều item", luôn ưu tiên
  **polling với timeout dài** (2-4 phút, tương tự các hàm `waitForStatus`/`waitForCRStatus` khác
  đã có) thay vì 1 lần `expect().toBeVisible()` với timeout ngắn.
- **Trước khi thêm `page.reload()` vào bất kỳ vòng poll nào, tự hỏi: view hiện tại có TỰ cập
  nhật theo model/binding khi backend xử lý xong hay không?** Nếu có (thường gặp với SAPUI5
  OData binding), reload là thừa — vừa nặng vừa rủi ro (xem mục 5a: app này đã biết fragile khi
  reload lặp lại). Chỉ dùng reload khi đã xác nhận view KHÔNG tự cập nhật nếu không refresh.

---

## Mục 8

### Timeout không nhất quán TRONG CÙNG 1 hàm — 1 nhánh đã fix, nhánh khác thì quên

**Triệu chứng:** `Timed out 10000ms waiting for expect(locator).toBeVisible() — Segmented button
"Submitted (N)"` ngay sau bước accept-duplicate (Requestor), flaky trên Automation Hub.

**Nguyên nhân:** `MassRequestPage.acceptDuplicateRequestor()` có 2 nhánh xử lý cùng 1 loại chờ
(chart cập nhật sau khi accept duplicate + click OK dialog Processing) tuỳ theo `expectedStatus`:

```ts
if (expectedStatus === 'DONE') {
  await expect(...ObjectStatus 'DONE'...).toBeVisible({ timeout: 120000 });  // ← đã generous
  ...
} else {
  await expect(...Segmented 'Submitted (N)'...).toBeVisible({ timeout: 10000 });  // ← vẫn ngắn!
}
```
Nhánh `DONE` đã được cho timeout 120000ms (2 phút) — đúng bài học ở [Mục 7](#mục-7) (chờ backend
xử lý xong sau accept-duplicate cần thời gian dài). Nhưng nhánh `else` (dùng cho `IN_APPROVAL`,
chính là case của `mass-dup-e2e-bp-03`/`mm-03` steward-reject) lại **bị bỏ sót**, vẫn giữ nguyên
10000ms — cùng 1 loại backend processing, cùng 1 hàm, nhưng 2 mức timeout khác hẳn nhau. Đây
không phải lỗi mới, không phải do mạng — là chính lỗi ở [Mục 6](#mục-6)/[Mục 7](#mục-7) nhưng
chưa được rà hết trong cùng 1 file.

**Fix:** Nâng timeout nhánh `else` lên cùng mức với nhánh `DONE` (120000ms):
```ts
} else {
  await expect(segGroup.getByRole('option').filter({ hasText: /Submitted \(\d+\)/ }))
    .toBeVisible({ timeout: 120000 });
}
```

**Bài học áp dụng lại (quan trọng):** Khi tìm thấy 1 chỗ bị "timeout quá ngắn cho backend xử lý
mass", đừng chỉ sửa đúng dòng bị báo lỗi — **đọc hết cả hàm chứa nó**, tìm các nhánh
if/else khác xử lý CÙNG loại chờ (cùng hành động trước đó: accept duplicate, submit, approve...)
nhưng dùng timeout khác nhau. Timeout không nhất quán trong cùng 1 hàm là dấu hiệu rõ ràng của
"đã vá 1 chỗ, quên vá chỗ song song" — rất hay xảy ra khi code có nhiều nhánh rẽ theo tham số
(`expectedStatus`, `expectedResult`...) cho cùng 1 loại thao tác nền.
- `acceptDuplicateRequestor()` dùng chung bởi **14 testcase** trên cả 2 suite
  `S4_QAS_MASS_DUP_BP01` và `S4_QAS_MASS_DUP_MM01` (grep `acceptDuplicateRequestor` để xác nhận)
  — fix 1 chỗ bảo vệ toàn bộ.

---

## Mục 10

### `verifyActivationCharts()` — cùng lỗi mục 8, xuất hiện lại ở 1 hàm khác/2 file khác

**Triệu chứng:** `Timed out 10000ms waiting for expect(locator).toBeVisible() — 'Activated (5)'`
ngay sau khi check "Complete Approved (5)" pass — cùng dạng lỗi [Mục 8](#mục-8) nhưng ở hàm
`verifyActivationCharts()`, và tồn tại y hệt ở **2 file** (`MassRequestPage.ts` lẫn
`MassActivationPage.ts`).

**Nguyên nhân:** Y hệt [Mục 8](#mục-8) — 2 check liên tiếp cho cùng 1 loại chờ "backend xử lý
xong mass activation", nhưng check thứ 2 ("Activated (5)", diễn ra SAU "Complete Approved" và cần
backend activate xong cả 5 item — nặng hơn, không nhẹ hơn) lại có timeout ngắn hơn hẳn (10000ms)
so với check thứ nhất (20000ms ở `MassRequestPage`, hoặc bằng nhau nhưng đều 10000ms ở
`MassActivationPage`) — không tương xứng với việc nó phải chờ xử lý nặng hơn.

**Fix:** Nâng timeout của cả 2 check lên tương đương các wait "DONE"/"Activated" khác đã fix
trong cùng codebase (120000ms), áp dụng cho cả 2 file:

```ts
async verifyActivationCharts(expectedStatus = 'COMPLETE_APPROVED'): Promise<void> {
  const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
  await expect(segGroup.getByRole('option').filter({ hasText: 'Complete Approved (5)' })).toBeVisible({ timeout: 20000 });
  await expect(segGroup.getByRole('option').filter({ hasText: 'Activated (5)' })).toBeVisible({ timeout: 120000 });
}
```

**Bài học áp dụng lại:** Đây là bằng chứng cho bài học ở [Mục 8](#mục-8) — cùng 1 kiểu lỗi timeout
không nhất quán **lặp lại ở nhiều hàm khác nhau, thậm chí ở nhiều file khác nhau** (2 page object
khác nhau nhưng có method trùng tên/trùng logic, dấu hiệu code được copy giữa các file). Khi fix
xong 1 chỗ, **grep tên method hoặc đoạn code đặc trưng** (vd `verifyActivationCharts`,
`'Activated (5)'`) trên toàn bộ `pages/` để tìm các bản sao chưa được fix, thay vì chỉ sửa đúng
file/dòng bị báo lỗi. `verifyActivationCharts()` dùng chung bởi **13 testcase** trên 4 suite khác
nhau (`S4_QAS_MASS_AUTO_BP01`, `S4_QAS_MASS_DUP_BP01`, `S4_QAS_MASS_DUP_MM01`, `S4_QAS_MASS_MM01`)
— fix cả 2 file bảo vệ toàn bộ.

---

## Mục 11

### Mở CR detail sau Activation — verify section render chậm bị timeout 10s

**Triệu chứng:** `Timed out 10000ms waiting for expect(locator).toBeVisible() — Title 'Units of
Measure'` ngay sau khi Steward click CR link để verify assignment rule (post-activation,
read-only). Screenshot lúc fail cho thấy trang CR detail **đã mở đúng** (đúng CR, đúng tab
"Global Data"), chỉ là phần "Units of Measure" — 1 section nằm phía dưới trong form MM01 khá dài
— chưa kịp render.

**Nguyên nhân:** `ActivationPage.clickCRLink()` chỉ chờ `waitForBusy(5000)` (5s) sau khi click —
ngắn hơn hẳn quy ước 30000ms đã dùng cho các bước "mở CR detail" tương tự khác trong codebase (vd
`MyInboxPage.openCRDetail`). Cùng lúc, `MainAssignmentRuleVerifyPage.verifyUnitsOfMeasureTableVisible()`
cũng chỉ cho 10000ms để tìm section này — 2 lớp timeout đều ngắn cộng lại khiến flow rất dễ fail
dưới tải cao (Automation Hub), dù về logic hoàn toàn đúng (không cần thêm bước tab-click hay
điều hướng nào khác — 2 testcase khác dùng chung đúng pattern này vẫn pass được, chỉ là may rủi
về timing).

**Fix:** Nâng cả 2 mức timeout lên 30000ms, khớp quy ước chung của codebase:

```ts
// pages/activation/ActivationPage.ts
async clickCRLink(crNumber: string): Promise<void> {
  await this.waitForBusy(5000);
  await this.page.getByRoleUI5('ObjectStatus', { text: crNumber }).click();
  await this.waitForBusy(30000);   // was 5000
}

// pages/verify/MainAssignmentRuleVerifyPage.ts
async verifyUnitsOfMeasureTableVisible(): Promise<void> {
  await expect(this.page.getByRoleUI5('Title', { text: 'Units of Measure' }).first())
    .toBeVisible({ timeout: 30000 });   // was 10000
}
```

**Bài học áp dụng lại:** Trước khi kết luận "thiếu bước điều hướng" (tab click, scroll...) khi 1
section không render kịp, hãy xem screenshot lúc fail trước — nếu trang đã ở ĐÚNG vị trí/tab mà
chỉ là section chưa kịp vẽ xong, đây vẫn là bài toán timeout ([Mục 5](#mục-5)–[Mục 10](#mục-10)),
không phải bài toán logic điều hướng. Đối chiếu timeout của bước "mở CR detail" (`waitForBusy`) và
bước "verify sau khi mở" liền kề nhau — nếu cả 2 đều ngắn hơn quy ước chung của codebase (30000ms
cho detail load), cộng dồn lại sẽ rất dễ flaky dù mỗi bước "nhìn qua" không có gì sai.
- `clickCRLink()` dùng chung bởi 3 testcase trong `S4_QAS_AUTO_MM01_ASSIGNMENT_RULE`.

---

## Mục 15

### Admin SPA bootstrap chậm — click tab ngay sau login/goto mà chưa chờ render xong

**Triệu chứng:** `TimeoutError: locator.click ... waiting for getByRoleUI5('IconTabFilter', {
text: 'Process Designer' })` ngay sau lần đăng nhập Admin đầu tiên trong test. Page snapshot lúc
fail cho thấy `tablist` HOÀN TOÀN RỖNG — chưa render tab nào cả (không phải nhầm tab, không phải
bị chặn bởi dialog khác).

**Nguyên nhân:** Cùng lớp lỗi timeout ngắn dưới tải cao đã gặp nhiều lần trong đợt review này —
`AdminRulePage.navigateToAdmin()` chỉ `waitForTimeout(2000)` cố định sau khi `goto()` (chỉ đợi
`domcontentloaded`, không đợi app admin bootstrap xong), rồi `navigateToProcessDesigner()` click
thẳng vào tab, chỉ dựa vào actionability timeout mặc định (10s) của `.click()` — không có wait
tường minh nào chờ tab bar render xong trước khi click.

**Fix:** `navigateToAdmin()` chờ busy indicator ẩn (thay flat sleep 2s) + `navigateToProcessDesigner()`
chờ tường minh tab visible với timeout dài hơn trước khi click:

```ts
// pages/AdminRulePage.ts
async navigateToAdmin(): Promise<void> {
  await this.page.goto(`${this.BASE_URL}/admin/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await this.page.waitForTimeout(1000);
}

async navigateToProcessDesigner(): Promise<void> {
  const tab = this.page.getByRoleUI5('IconTabFilter', { text: 'Process Designer' });
  await expect(tab).toBeVisible({ timeout: 30000 });   // was: click() thẳng, chỉ 10s mặc định
  await tab.click();
}
```

**Bài học áp dụng lại:** `AdminRulePage` là base class của **6 page object**
(`AdminMandatoryRulePage`, `AdminFilterRulePage`, `AdminAssignmentRulePage`,
`AdminEditableRulePage`, `AdminVisibleRulePage`, `AdminDuplicationRulePage`) — fix ở tầng base
class bảo vệ TOÀN BỘ testcase Admin của mọi loại rule, không chỉ Mandatory Rule. Khi 1 bước
điều hướng nằm ngay sau `loginAs()`/`goto()` đầu tiên của 1 role, luôn ưu tiên chờ theo tín hiệu
thực tế (busy indicator, hoặc chính element sắp click) thay vì `waitForTimeout` cố định hay dựa
vào actionability timeout mặc định của `.click()` — bootstrap lần đầu của app thường chậm hơn
các lần điều hướng sau đó trong cùng session.

---

# Nhóm B — Dialog / Popup / Tab lifecycle

Nhóm lỗi: 1 dialog/popup/tab mở TRƯỚC ĐÓ nhiều bước chỉ đóng/chuyển "về mặt UI" nhưng chưa hoàn
tất thật (backdrop/animation/route-swap chưa xong), khiến hành động ở bước SAU (có thể cách xa,
ở 1 file khác) bị chặn hoặc chạy trên state sai — dễ nhầm với lỗi "timing/backend chậm" thuần
túy (Nhóm A) nhưng cách chẩn đoán và fix khác nhau.

## Mục 12

### F4 SelectDialog chưa đóng hẳn — backdrop chặn pointer events của thao tác nhiều bước sau đó

**Triệu chứng:** `TimeoutError: locator.click ... subtree intercepts pointer events` khi click
nút "Add Rule" — log cho thấy 1 `<div role="dialog">` (class `sapMTableSelectDialog`,
`sapMDialogOpen`) vẫn đang che phủ màn hình, dù về mặt luồng nghiệp vụ dialog đó (F4 chọn Source
Value) đáng lẽ đã được chọn xong và đóng lại **nhiều bước trước đó**.

**Nguyên nhân:** `AdminEditableRulePage.fillSourceValue()` (nhánh F4) sau khi click chọn row
trong SelectDialog chỉ `waitForTimeout(300)` cố định rồi return — không xác nhận dialog/backdrop
đã thực sự đóng. Dưới tải cao, animation đóng dialog + modal backdrop (`.sapUiBLy`) chưa kịp biến
mất trong 300ms; nó vẫn còn trong DOM (ở trạng thái đang biến mất) và tiếp tục chặn pointer events
cho MỌI click sau đó, kể cả những click cách xa nhiều bước (ở đây là "Add Rule"). Đối chiếu
`AdminFilterRulePage.ts` (rule khác, cùng loại F4 SelectDialog) không gặp lỗi này vì
`clickAddRule()` của nó đã có `waitFor({ state: 'hidden' })` cho `.sapUiBLy` — nhưng
`AdminEditableRulePage.fillSourceValue()` thiếu đúng bước tương tự tại nơi dialog thực sự được
mở/đóng.

**Fix:** Thay `waitForTimeout(300)` bằng chờ tường minh cả SelectDialog và modal backdrop chuyển
sang `hidden` trước khi tiếp tục:

```ts
// pages/admin/AdminEditableRulePage.ts — fillSourceValue(), nhánh F4, sau khi chọn row
await this.page.locator('.sapMTableSelectDialog').first()
  .waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
await this.page.locator('.sapUiBLy')
  .waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
await this.page.waitForTimeout(300);
```

**Bài học áp dụng lại:** Khi gặp "subtree intercepts pointer events" tại 1 hành động, đừng chỉ
nhìn ngay tại chỗ click bị chặn — lỗi thường nằm ở **1 dialog/popup mở TRƯỚC ĐÓ nhiều bước** chưa
được đóng hẳn (chỉ đóng "về mặt UI" nhưng backdrop/animation chưa hoàn tất). Sau khi tương tác với
bất kỳ dialog/SelectDialog nào, luôn chờ tường minh nó (và block layer `.sapUiBLy` nếu có) chuyển
`hidden` trước khi coi bước đó là xong, thay vì `waitForTimeout` cố định — đặc biệt khi cùng 1
loại dialog đã có sẵn page object khác trong codebase xử lý đúng (đối chiếu để tìm pattern thiếu).

**⚠️ Cập nhật — cùng lỗi đã lan sang page object khác (phát hiện qua `vr-e2e-mm-01-boundary.spec.ts`):**
Grep `sapMTableTBody > tr.sapMListTblRow` trên toàn bộ `pages/admin/` cho thấy đoạn code F4 y
hệt (thiếu đúng bước wait này) còn tồn tại ở **3 file khác**: `AdminVisibleRulePage.fillSourceValueViaF4()`,
`AdminMandatoryRulePage.fillSourceValue()`, và `AdminFilterRulePage.fillTargetProperty()` (biến
thể — chỉ có `waitForBusy(1000)` ngắn, không có wait dialog/backdrop). Lần này triệu chứng khác
đi: KHÔNG phải "subtree intercepts pointer events" mà là **"Please enter all required fields"** —
vì dialog chưa đóng hẳn khi `clickAddRule()` chạy, giá trị Source Value vừa chọn trong F4 chưa
kịp commit vào field, nên Add Rule submit với Source Value rỗng. Cùng 1 root cause (dialog/backdrop
chưa đóng hẳn trước khi hành động tiếp theo chạy) có thể biểu hiện ra thành NHIỀU loại lỗi khác
nhau tùy vào hành động nào chạy tiếp theo — không chỉ mỗi "pointer events bị chặn". Đã fix cả 3
file theo đúng pattern đã dùng cho `AdminEditableRulePage`. Đã kiểm tra `AdminAssignmentRulePage.ts`
và `AdminDuplicationRulePage.ts` (2 subclass còn lại của `AdminRulePage`) — không có pattern F4
này, không cần sửa.

**Bài học bổ sung:** Khi 1 fix dựa trên "grep để tìm bản sao" ([Mục 8](#mục-8), [10](#mục-10),
[13](#mục-13)) chỉ tìm bằng tên hàm hoặc chuỗi lỗi cụ thể, có thể bỏ sót bản sao gây ra TRIỆU
CHỨNG KHÁC dù cùng root cause — nên grep theo **đoạn code/locator đặc trưng của nguyên nhân** (ở
đây: `sapMTableTBody > tr.sapMListTblRow`, tức là "nơi tương tác với F4 SelectDialog"), không chỉ
theo tên method hay thông báo lỗi.

---

## Mục 16

### `MyInboxPage.goto()` — search field timeout, IconTabFilter no-op retry, dialog OK best-effort

Đây là mục đúc kết từ **4 vòng fix liên tiếp trên thực tế** cho cùng 1 hàm — giữ nguyên đầy đủ vì
mỗi vòng dạy 1 bài học chẩn đoán khác nhau (xem tổng hợp ở cuối). Chỉ **Fix v4 (cuối)** là bản cần
áp dụng khi copy sang dự án khác; các bản v1-v3 để lại làm bằng chứng "vì sao các hướng đơn giản
hơn không đủ".

**Triệu chứng (lần đầu):** `Timed out 30000ms waiting for expect(locator).toBeVisible() —
[id$="myInboxSearch-I"]` ngay sau `navigateTo('My Inbox')` trong `goto()`, dù test pass ổn định
phần lớn thời gian — flaky, không phải fail cố định.

**Nguyên nhân v1:** Cùng lớp lỗi "SPA route render intermittent" đã ghi nhận ở
[Mục 4](#mục-4)/[5a](#5a-mở-cr-detail-từ-list-không-có-retryreload-giống-lỗi-mục-4-nhưng-ở-chỗ-khác)/[6](#mục-6):
`navigateTo()` click tab rồi gọi `waitForBusy()` — hàm này tự `.catch()` nuốt timeout, không đảm
bảo nội dung tab đã render xong khi trả về. `goto()` chỉ chờ **1 lần duy nhất** cho search field —
không có vòng retry click lại tab.

**Fix v1:** Thêm vòng retry 3 lần, mỗi lần gọi lại `navigateTo('My Inbox')` nếu search field chưa
xuất hiện (không dùng `page.reload()` — theo bài học mục 5a: reload lặp lại có thể làm SPA vỡ
trắng vĩnh viễn).

```ts
async goto(): Promise<void> {
  const searchField = this.page.locator('[id$="myInboxSearch-I"]');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await this.navigateTo('My Inbox');
    if (await searchField.isVisible({ timeout: 15000 }).catch(() => false)) return;
  }
  throw new Error('[MyInbox] Failed to load My Inbox tab after 3 attempts');
}
```

**⚠️ Bug v1 (phát hiện qua chạy thực tế lần tiếp theo — lỗi đổi thành):**
`Error: [MyInbox] Failed to load My Inbox tab after 3 attempts` — cả 3 lần thử đều fail giống
nhau (không phải fail ngẫu nhiên 1/3), gợi ý nguyên nhân không phải "cần thêm thời gian/thêm lần
thử" mà là 1 trạng thái treo cố định TỪ TRƯỚC vòng retry.

**Nguyên nhân v2:** Đối chiếu với `cl-e2e-mm-01-copy-submit-approve-activate.spec.ts` (cùng
pattern gọi `myInbox.goto()` ngay sau Requestor submit, không flaky ở lần so sánh đó) — ngay
trước `goto()` là `submitCRWithConfirm()` (`helpers/workflow/workflow.ts`), hàm dismiss dialog
xác nhận CR bằng click nút "OK" **best-effort thuần** (`.catch(() => {})`). Nếu click đó miss,
dialog + `#sap-ui-blocklayer-popup` **vẫn còn mở** sang Phase 2 — cùng lớp lỗi [Mục 12](#mục-12)
(backdrop chưa đóng hẳn), chỉ ở 1 dialog khác.

**Fix v2:** 2 thay đổi bổ sung tại 2 điểm trung tâm — (1) `submitCRWithConfirm()` chỉ click "OK"
nếu nút đang thực sự hiển thị, và LUÔN gọi `closeBlockingPopup()` sau đó bất kể click có ăn hay
không; (2) `MyInboxPage.goto()` gọi thêm `closeBlockingPopup()` ở ĐẦU mỗi lần retry, làm lớp bảo
vệ độc lập:

```ts
// helpers/workflow/workflow.ts
const okButton = page.getByRoleUI5('Button', { text: 'OK' }).first();
if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  await okButton.click({ timeout: 5000 }).catch(() => {});
}
await closeBlockingPopup(page);
```
```ts
// pages/cr/MyInboxPage.ts
for (let attempt = 1; attempt <= 3; attempt++) {
  await closeBlockingPopup(this.page);
  await this.navigateTo('My Inbox');
  if (await searchField.isVisible({ timeout: 20000 }).catch(() => false)) return;
}
```

**⚠️ Bug v2 (phát hiện qua chạy thực tế lần thứ 3 — lỗi giữ nguyên y hệt):**
`closeBlockingPopup()` không đổi được kết quả — vẫn fail đều ở cả 3/3 lần thử. Đọc lại đúng cơ chế
UI5 `IconTabFilter`/`IconTabBar`: control này **không bắn lại sự kiện `select`** khi click vào tab
đang đã được chọn sẵn. Ở attempt 1, chuyển từ "My Request" sang "My Inbox" là 1 sự kiện thật; nếu
lần render đó thất bại thật (không chỉ chậm), thì click lại ở attempt 2/3 (vẫn đang trên "My
Inbox") là **no-op hoàn toàn** — không kích hoạt gì cả, nên cả 3 lần fail giống hệt nhau. Đây là
dấu hiệu chẩn đoán khác hẳn "render chậm ngẫu nhiên" (Nhóm A — những lỗi đó pass được ở phần lớn
lần retry): **fail ĐỀU 100% qua N lần retry giống nhau là dấu hiệu retry hiện tại không tạo ra
hành động khác biệt thực sự ở mỗi lần** — bug ở chính vòng retry, không phải ở tốc độ app.

**Fix v3:** Giữa các lần thử thất bại, chuyển sang 1 tab khác ("My Request") trước rồi mới click
lại "My Inbox" — ép UI5 phải bắn lại sự kiện `select` thật:

```ts
for (let attempt = 1; attempt <= 3; attempt++) {
  await closeBlockingPopup(this.page);
  await this.navigateTo('My Inbox');
  if (await searchField.isVisible({ timeout: 20000 }).catch(() => false)) return;
  if (attempt < 3) await this.navigateTo('My Request').catch(() => {});
}
```

**⚠️ Bug v3 (tái phát ở 1 spec KHÁC, cùng thông báo lỗi y hệt) — lần này dừng đoán, mở
`test-results/**/test-failed-1.png` + `trace.zip` thật của đúng lần fail (xem
[Nhóm F](#nhóm-f--phương-pháp-debug-flaky-test)):**
- **Screenshot của attempt fail (không có trace vì `trace: 'on-first-retry'` — chỉ chụp từ lần
  retry, không phải lần đầu):** xác nhận ĐÚNG giả thuyết v3 — nav bar highlight đúng "My Inbox",
  nhưng **nội dung pane bên dưới vẫn là view "My Request"**. Bug thật ở tầng UI5 router, không
  phải logic retry sai.
- **Trace của lần retry kế tiếp (Playwright tự retry, `retries: 1`)** cho cùng test: log action
  thật cho thấy `click 'My Inbox'` → 20s không thấy search field → `click 'My Request'` → `click
  'My Inbox'` lần 2 → search field xuất hiện chỉ sau ~830ms — **chứng minh cơ chế "switch away rồi
  quay lại" của fix v3 THỰC SỰ hoạt động**, chỉ là lần fail ban đầu cần nhiều hơn 3 lần thử mới
  hồi phục được dưới tải nặng hơn bình thường.

**Fix v4 (cuối — dựa trên bằng chứng thực nghiệm, không phải đoán thêm):** Giữ nguyên toàn bộ
logic v3, chỉ tăng số lần thử từ 3 → 5:

```ts
// pages/cr/MyInboxPage.ts
const MAX_ATTEMPTS = 5;
const searchField = this.page.locator('[id$="myInboxSearch-I"]');
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  await closeBlockingPopup(this.page);
  await this.navigateTo('My Inbox');
  if (await searchField.isVisible({ timeout: 20000 }).catch(() => false)) {
    console.log('[MyInbox] My Inbox tab loaded');
    return;
  }
  console.log(`[MyInbox] Search field not visible after tab click (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying...`);
  if (attempt < MAX_ATTEMPTS) {
    await this.navigateTo('My Request').catch(() => {});
  }
}
throw new Error(`[MyInbox] Failed to load My Inbox tab after ${MAX_ATTEMPTS} attempts`);
```

**Bài học áp dụng lại (đúc kết cả 4 vòng — quan trọng nhất trong toàn file):**
- **Khi CÙNG 1 thông báo lỗi tái phát ở 1 spec KHÁC sau khi đã fix, đừng tiếp tục suy luận thêm 1
  giả thuyết mới trên giấy** — mở bằng chứng thật (`test-failed-1.png`, `trace.zip`) TRƯỚC. Lần
  v3→v4 ở trên, bằng chứng xác nhận giả thuyết v3 vẫn ĐÚNG, chỉ thiếu tham số (số lần thử) — nếu
  không xem trace, rất dễ nhảy sang 1 giả thuyết hoàn toàn khác (vd nghi lại blocklayer/dialog)
  một cách không cần thiết.
- **Fail giống hệt nhau, đều 100% qua mọi lần retry** (v2→v3) là dấu hiệu chẩn đoán khác hẳn "fail
  ngẫu nhiên 1 phần các lần" (dấu hiệu race condition/timing — Nhóm A). Khi thấy fail đều, nghi
  ngờ ngay chính LOGIC của vòng retry (có tạo ra khác biệt thật giữa các lần thử không?) trước khi
  tiếp tục tăng timeout hoặc thêm best-effort cleanup không liên quan.
- Với các control dạng **tab** (IconTabBar, SegmentedButton...), 1 vòng retry "click lại đúng chỗ
  vừa click" có thể là **no-op hoàn toàn** nếu control không coi việc click vào lựa chọn đang
  active là 1 thay đổi trạng thái. Retry loại này phải đi qua 1 trạng thái trung gian khác trước
  khi quay lại.
- `.catch(() => {})` best-effort trên 1 click dùng để ĐÓNG dialog/toast không chỉ có rủi ro "click
  bị miss" (chấp nhận được nếu toast tự ẩn) — còn có rủi ro **để lại blocklayer treo**, ảnh hưởng
  đến MỌI hành động điều hướng ở bước SAU, dù cách xa hàng chục dòng code hoặc 1 file khác hoàn
  toàn. Luôn gọi thêm `closeBlockingPopup()` ngay sau, không chỉ tin vào việc click đã ăn.
- `retries: 1` trong `playwright.config.ts` có thể khiến 1 test "flaky ở attempt 1" NHƯNG PASS ở
  attempt 2 (retry) — báo cáo lỗi hiển thị cho người dùng có thể là lỗi của attempt 1 dù bản thân
  retry sau đó đã đi xa hơn nhiều (chạy tới tận bước khác rồi mới fail vì 1 lý do không liên quan).
  `trace: 'on-first-retry'` nghĩa là **trace.zip luôn là của lần retry**, KHÔNG phải lần fail đầu
  tiên — đối chiếu lại timeline/CR number trong trace để chắc nó khớp đúng lỗi đang xem, đừng suy
  luận cho attempt 1 chỉ dựa vào trace của attempt 2.

---

# Nhóm C — Locator & Assertion đúng chuẩn Playwright

## Mục 9

### Click CR link đúng element nhưng bị "disabled" — thực chất là click nhầm UI5 clone element

**Triệu chứng:** `TimeoutError: locator.click ... element is not enabled`, locator resolve ra
1 element DUY NHẤT (không phải lỗi strict-mode nhiều match) nhưng element đó có
`aria-disabled="true"`, class `sapMLnkDsbl`, và id có hậu tố lạ dạng `-__clone841`.

**Nguyên nhân:** SAP UI5 đôi khi giữ lại trong DOM 1 bản **"clone" nội bộ** của control (dùng để
đo đạc kích thước/render nội bộ), bản clone này vẫn mang cùng role + text như control thật nhưng
**vĩnh viễn bị disable** và không nhằm để tương tác. `getByRoleUI5('Link', { text: crNumber })`
gọi trên toàn trang (không scope vào đúng `<tr>` row) có thể resolve nhầm vào đúng bản clone này
thay vì link thật trong bảng kết quả — khác với lỗi "not found"/"chậm render" đã gặp trước đó,
đây là **click nhầm 1 element khác hoàn toàn không phải link thật**, nên dù chờ bao lâu cũng
không bao giờ "enabled" được (vì nó vốn dĩ không phải link tương tác).

**Fix:** Scope locator vào đúng `<tr>` chứa CR number trước khi tìm Link bên trong (cùng cách
`verifyBothStatuses()` trong file này đã làm), và assert `toBeEnabled()` tường minh trước khi
click — nếu vẫn resolve nhầm clone, sẽ fail rõ ràng ở bước `toBeEnabled` thay vì click mù:

```ts
const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber, { exact: true }) }).first();
await crRow.waitFor({ state: 'visible', timeout: 15000 });
const crLink = crRow.getByRoleUI5('Link', { text: crNumber }).first();
await expect(crLink).toBeEnabled({ timeout: 20000 });
await crLink.click();
```

Áp dụng cho cả `acceptDuplicateRequestor()` và `openCRLink()` trong `pages/mass/MassRequestPage.ts`
— cả 2 đều có cùng pattern `getByRoleUI5('Link', { text: crNumber })` không scope trước đó.

**Bài học áp dụng lại:** Khi gặp `element is not enabled`/`not visible` mà locator vẫn resolve ra
đúng 1 element (không phải lỗi "not found" hay strict-mode nhiều match), đừng vội nghĩ ngay là
"cần chờ lâu hơn" — kiểm tra kỹ `id`/`class` của element trong log lỗi trước. Nếu thấy hậu tố lạ
kiểu `__cloneNNN` hoặc class dạng `*Dsbl`/`*disabled`, đó là dấu hiệu đang click nhầm 1 UI5 clone
element chứ không phải control thật — chờ thêm bao lâu cũng vô ích, cần **scope locator hẹp hơn**
(vào đúng row/container chứa control thật) thay vì tăng timeout.

---

## Mục 14

### Test tay (manual) không thấy lỗi, chỉ fail khi automation — anti-pattern `isVisible()` + `expect(bool)` thay vì web-first assertion

**Triệu chứng:** `expect(deleted).toBeFalsy() — Received: true` ngay sau khi xóa 1 rule (Admin
Mandatory Rule), dù backend đã xóa thành công. Test tay (click tay từng bước) không bao giờ gặp
lỗi này.

**Nguyên nhân:** Code dùng pattern **không đúng best practice của Playwright**:
```ts
const deleted = await row.first().isVisible({ timeout: 3000 }).catch(() => false);
expect(deleted).toBeFalsy();
```
`locator.isVisible({ timeout })` là 1 check **tức thời, không polling** — tham số `timeout` chỉ
giới hạn thời gian chờ element attach vào DOM để kiểm tra, KHÔNG lặp lại kiểm tra visibility theo
thời gian. Ngay sau khi xóa, bảng danh sách cần 1 khoảng thời gian để backend xử lý + re-render
lại (loại bỏ row vừa xóa) — nếu check chạy đúng vào khoảnh khắc đó, nó bắt được trạng thái
**chưa kịp refresh** (row vẫn còn) và trả về `true`, dù chỉ chờ thêm chút nữa là đúng. Test tay
không bao giờ dính lỗi này vì thao tác tay tự nhiên có độ trễ (nhìn màn hình, di chuột) đủ để
backend kịp xử lý trước khi mắt người kiểm tra lại.

**Fix:** Thay bằng **web-first assertion** `expect().not.toBeVisible({ timeout })` — loại assertion
này TỰ ĐỘNG polling/retry cho tới khi đúng hoặc hết timeout, đúng chuẩn Playwright khuyến nghị
(tránh check thủ công `isVisible()`/`textContent()` rồi so sánh boolean/string bằng `expect`):

```ts
// SAI — check tức thời, không chờ UI kịp cập nhật
const deleted = await row.first().isVisible({ timeout: 3000 }).catch(() => false);
expect(deleted).toBeFalsy();

// ĐÚNG — assertion tự poll cho tới khi row thực sự biến mất
await expect(row.first()).not.toBeVisible({ timeout: 15000 });
```

**Phát hiện thêm (bug thật, không chỉ log gây nhiễu):** Log kèm theo cho thấy 1 chuỗi text lạ
("Add new Business Rule...If the required field is ticked...") được in ra như thể là "Error
dialog" ngay cả khi Add Rule **thành công** (toast "Business Rule Created" xuất hiện ngay sau).
`AdminMandatoryRulePage.clickAddRule()` dùng locator gộp `[role="alertdialog"], [role="dialog"]`
lọc theo `hasText: /error|required|already/i` để phát hiện lỗi — nhưng `[role="dialog"]` khớp
luôn với chính dialog "Add New" đang mở (dialog bình thường, không phải lỗi), và message strip
hướng dẫn trong dialog đó có sẵn câu "If the **required** field is ticked..." nên regex khớp
nhầm. Hậu quả không chỉ là log gây nhiễu — code còn `return` sớm khi `hasError === true`, **bỏ
qua bước `waitForBusy(3000)`** ngay cả trên luồng thành công, có thể góp phần vào các race
condition khác về sau. Đối chiếu `AdminDuplicationRulePage.clickAddRule()` (cùng loại flow, dùng
`[role="alertdialog"]` một mình, không có `hasText` filter) xác nhận đây là pattern đúng.

```ts
// pages/admin/AdminMandatoryRulePage.ts — SAI: [role="dialog"] khớp nhầm dialog Add New bình thường
const hasError = await this.page.locator('[role="alertdialog"], [role="dialog"]')
  .filter({ hasText: /error|required|already/i }).first().isVisible({ timeout: 1000 }).catch(() => false);

// ĐÚNG — chỉ role="alertdialog" (đúng ARIA role cho lỗi thật)
const hasError = await this.page.locator('[role="alertdialog"]').first()
  .isVisible({ timeout: 1000 }).catch(() => false);
```

**Bài học áp dụng lại:**
- "Pass ở terminal/test tay, chỉ fail khi automation chạy nhanh liên tục" gần như luôn là dấu
  hiệu của check tức thời (`isVisible()`, `textContent()`...) thiếu polling, chứ không phải lỗi
  ứng dụng — ưu tiên `expect(locator).toBeVisible()/.not.toBeVisible()` (tự động retry) thay vì
  gọi hàm rồi so sánh kết quả bằng `expect(value).toBe(...)`.
- Khi phát hiện log "error dialog" xuất hiện ngay cả trên luồng thành công, đừng coi đó là nhiễu
  vô hại — kiểm tra xem locator đó có được dùng để REDIRECT luồng code (early return, skip bước
  tiếp theo) hay không; false positive ở đây có thể âm thầm bỏ qua các bước wait quan trọng.
- `[role="dialog"]` khớp với MỌI dialog thường (form, popup...), không riêng dialog lỗi — chỉ
  dùng `[role="alertdialog"]` khi cần phát hiện lỗi/cảnh báo thật.

---

# Nhóm D — Giới hạn dữ liệu đặc thù SimpleMDG

⚠️ Chỉ tham khảo CÁCH làm (đặt clamp tại 1 điểm trung tâm, hướng cắt chuỗi). Số liệu cụ thể (40
ký tự, 18 ký tự...) là của riêng hệ thống SimpleMDG QAS — dự án khác PHẢI xác nhận lại giới hạn
thật, không copy nguyên số liệu.

## Mục 1

### Duplicate timestamp khi chạy song song (DUPLICATE error)

**Triệu chứng:** Khi nhiều testcase chạy đồng thời trong cùng 1 phút, giá trị timestamp
dùng để tạo Language Description bị trùng nhau → backend trả lỗi DUPLICATE.

**Nguyên nhân:** `suite.config.ts` của suite dùng `generateMMTimestamp()` — hàm này chỉ
làm tròn tới phút (`yyyymmdd_hhmm`, 13 ký tự), không có phần ngẫu nhiên để phân biệt các
run chạy trong cùng 1 phút.

**Fix:** Đổi sang `generateUniqueMMTimestamp()` — hàm đã có sẵn trong
`helpers/data/dataFactory.ts`, append thêm 6 ký tự hex ngẫu nhiên
(`crypto.randomBytes(3).toString('hex')`) sau timestamp:

```ts
// helpers/data/dataFactory.ts
export function generateUniqueMMTimestamp(): string {
  return `${generateMMTimestamp()}_${crypto.randomBytes(3).toString('hex')}`;
}
// => "20260812_1806_7e6b33" (20 ký tự)
```

Trong `suite.config.ts` của từng suite:

```ts
// TRƯỚC
import { generateMMTimestamp } from '../../helpers/data';
export function generateTimestamp(): string {
  return generateMMTimestamp();
}

// SAU
import { generateUniqueMMTimestamp } from '../../helpers/data';
export function generateTimestamp(): string {
  return generateUniqueMMTimestamp();
}
```

**Cách áp dụng cho dự án tương tự:**
- Grep `generateMMTimestamp` trong tất cả `suites/*/suite.config.ts`.
- Suite nào **chưa** dùng `generateUniqueMMTimestamp` (chỉ dùng `generateMMTimestamp` trần) và
  **có** cơ chế check Duplicate đang bật → cần đổi sang bản unique.
- Suite nào đã tắt tính năng check Duplicate thì không bắt buộc (rủi ro thấp hơn), có thể để sau.
- File đã fix trong dự án gốc: `suites/S4_QAS_MM01_COMMENT_LOGO/suite.config.ts`.
- File đã biết nhưng **chưa** fix (do check Duplicate đang tắt, chờ xác nhận thêm):
  `suites/S4_QAS_MUL_MM01/suite.config.ts`, `suites/S4_QAS_MUL_AUTO_BP01/suite.config.ts`.

---

## Mục 2

### Language Description vượt quá độ dài cho phép (giới hạn hệ thống: 40 ký tự)

**Triệu chứng:** Submit CR bị lỗi vì giá trị Language Description (do ghép
`prefix + timestamp + " EN"/" CA"`) vượt quá giới hạn ký tự mà hệ thống SimpleMDG cho phép.

**Giới hạn thực tế của hệ thống:** **40 ký tự** (lưu ý: ban đầu nhầm là 100, đã đính chính).

**Fix:** Thêm clamp tập trung tại `pages/cr/ProductRequestForm.ts` — chỉ cần sửa 1 chỗ vì
tất cả các call site (helper dùng chung `openCopyAndFillForm` + các spec gọi trực tiếp) đều
đi qua đây:

```ts
// pages/cr/ProductRequestForm.ts
const LANGUAGE_DESCRIPTION_MAX_LENGTH = 40;

async updateLanguageDescriptionByRow(rowIndex: number, value: string): Promise<void> {
  if (value.length > LANGUAGE_DESCRIPTION_MAX_LENGTH) {
    console.warn(
      `[ProductRequestForm] Language Description (row ${rowIndex}) exceeds ${LANGUAGE_DESCRIPTION_MAX_LENGTH} chars (${value.length}) — truncating: "${value}"`
    );
    value = value.slice(0, LANGUAGE_DESCRIPTION_MAX_LENGTH);
  }
  // ... phần còn lại giữ nguyên
}

async updateAllLanguageDescriptions(value: string): Promise<void> {
  if (value.length > LANGUAGE_DESCRIPTION_MAX_LENGTH) {
    console.warn(/* ... */);
    value = value.slice(0, LANGUAGE_DESCRIPTION_MAX_LENGTH);
  }
  // ... phần còn lại giữ nguyên
}
```

`updateLanguageDescription()` gọi qua `updateLanguageDescriptionByRow(0, ...)` nên tự động
được bảo vệ, không cần sửa thêm.

**Cách áp dụng cho dự án tương tự:**
- Xác định đúng giới hạn ký tự thực tế của field Language Description trên hệ thống đích
  (đừng giả định — có thể khác nhau giữa các môi trường/instance).
- Đặt clamp tại đúng 1 điểm trung tâm (page object method dùng chung), KHÔNG sửa rải rác ở
  từng file spec — giảm rủi ro bỏ sót.
- Áp dụng tương tự cho bất kỳ field nào khác có giới hạn ký tự cứng (xem [Mục 3](#mục-3)).

---

## Mục 3

### Old Material Number vượt quá độ dài cho phép (giới hạn hệ thống: 18 ký tự)

**Triệu chứng:** Lỗi `The length of the old material number must not exceed 18 characters`.

**Nguyên nhân:** Sau khi đổi sang `generateUniqueMMTimestamp()` (20 ký tự, xem [Mục 1](#mục-1)),
một số suite (`S4_QAS_AUTO_MM01`, `S4_QAS_DUP_AUTO_MM01` — tổng cộng 26 file spec) truyền thẳng
`timestamp` (20 ký tự) vào field Old Material Number, vượt quá giới hạn 18 ký tự của field này.

**Fix:** Thêm clamp tập trung tại `pages/cr/ProductRequestForm.ts::updateOldMaterialNumber()`:

```ts
const OLD_MATERIAL_NUMBER_MAX_LENGTH = 18;

async updateOldMaterialNumber(value: string): Promise<void> {
  if (value.length > OLD_MATERIAL_NUMBER_MAX_LENGTH) {
    // Giữ lại phần ĐUÔI (nơi chứa hex ngẫu nhiên của generateUniqueMMTimestamp)
    // thay vì phần đầu, để không mất đi tính duy nhất khi chạy song song.
    const truncated = value.slice(-OLD_MATERIAL_NUMBER_MAX_LENGTH);
    console.warn(
      `[ProductRequestForm] Old_Material_Number exceeds ${OLD_MATERIAL_NUMBER_MAX_LENGTH} chars (${value.length}) — truncating: "${value}" -> "${truncated}"`
    );
    value = truncated;
  }
  // ... phần còn lại giữ nguyên
}
```

**Lưu ý quan trọng khi áp dụng lại:** Khi clamp một giá trị có phần "ngẫu nhiên đảm bảo
tính duy nhất" (như timestamp + random suffix), luôn cắt bớt **phần đầu** (giữ đuôi), KHÔNG
cắt đuôi — nếu không sẽ vô tình xóa mất phần random, làm tăng nguy cơ trùng dữ liệu giữa các
run song song trở lại (tức là fix mục 3 có thể vô tình phá fix mục 1 nếu làm sai chiều cắt).

**Cách áp dụng cho dự án tương tự:**
- Kiểm tra lại TẤT CẢ các field khác có giới hạn ký tự cứng mà đang nhận giá trị build từ
  `timestamp`/`generateUniqueMMTimestamp()` (không chỉ riêng Old Material Number) — vì đây là
  hệ quả domino của việc tăng độ dài timestamp ở [Mục 1](#mục-1).
- Danh sách file đã bị ảnh hưởng bởi lỗi này trong dự án gốc (grep
  `updateOldMaterialNumber(timestamp)`):
  - `suites/S4_QAS_AUTO_MM01/e2e/*.spec.ts` (13 file)
  - `suites/S4_QAS_DUP_AUTO_MM01/e2e/*.spec.ts` (13 file)

---

# Nhóm E — Lỗi call-site (không phải bug trong page object dùng chung)

## Mục 13

### Quên truyền `confirmLabel` tại call site — rơi vào default sai object type (không phải bug trong page object)

**Triệu chứng:** `Timed out 60000ms waiting for expect(locator).toBeVisible() — locator('bdi')
.filter({ hasText: 'Business Partner' })` trong lúc Approve, dù template đang test là **Product**
(label thật trên trang là "Material Number", không có "Business Partner" ở đâu cả).

**Nguyên nhân:** `ApproverActions.approve(crNumber, comment, confirmLabel = 'Business Partner')`
có tham số thứ 3 `confirmLabel` với default là `'Business Partner'` (dùng cho luồng Business
Partner khác trong project). Spec `fr-e2e-mm-07-workflow.spec.ts` gọi `openCRDetail(newCR,
'Product', 'Material Number')` đúng ngay dòng trước, nhưng dòng gọi `approve()` ngay sau đó lại
**quên truyền `confirmLabel`**, nên rơi vào default sai — không phải lỗi trong `ApproverActions`
hay `ApproverActions.approve()` (hàm hoàn toàn đúng, chỉ là bị gọi thiếu tham số).

```ts
// SAI — thiếu tham số thứ 3, rơi vào default 'Business Partner'
await inbox.openCRDetail(newCR, 'Product', 'Material Number');
await approverActions.approve(newCR, suiteConfig.comments.approverApprove);

// ĐÚNG — confirmLabel phải khớp với object type vừa mở ở dòng trên
await approverActions.approve(newCR, suiteConfig.comments.approverApprove, 'Material Number');
```

**Cách xác nhận đây là lỗi cục bộ (không lan rộng):** Grep toàn bộ project `.approve(newCR` để
so sánh cách gọi ở TẤT CẢ testcase khác cùng loại template (Product) — nếu mọi nơi khác đều
truyền đúng `'Material Number'` (đã xác nhận ở các suite `VISIBLE_RULE`, `ASSIGNMENT_RULE`...),
thì đây chỉ là 1 chỗ gọi bị thiếu tham số khi viết spec, KHÔNG cần sửa page object.

**Bài học áp dụng lại:** Khi 1 hàm dùng chung có tham số optional với default gắn với 1 loại
object type cụ thể (vd `confirmLabel = 'Business Partner'` mặc định cho BP nhưng project còn
test cả Product/Material), lỗi rất dễ xảy ra ở **call site** (quên truyền) chứ không phải trong
chính hàm — nhất là khi dòng gọi trước đó (`openCRDetail`) đã đúng, dễ khiến người review chủ
quan nghĩ dòng sau cũng đúng theo. Khi gặp lỗi "label sai loại object" (Business Partner vs
Material Number vs...), luôn: (1) kiểm tra call site có truyền đủ tham số không trước khi nghi
ngờ page object, (2) đối chiếu cách gọi ở các testcase khác cùng loại template để xác nhận phạm
vi lỗi chỉ ở 1 chỗ hay lan rộng.

**Ghi chú thêm (không phải bug — đơn giản hóa theo yêu cầu):** Sau khi test pass, phần CLEANUP
của `fr-e2e-mm-07-workflow.spec.ts` được đơn giản hóa: bỏ `adminPage.goto()` +
`navigateToFilterRule()` trước khi xóa rule, vì admin page vẫn đang đứng sẵn ở trang Template
Rules từ bước SETUP (không hề điều hướng đi đâu trong lúc Requestor/Approver/Steward chạy), và
`deleteFilterRule()` đã tự `searchRuleBySourceSection()` bên trong. Đối chiếu
`ar-e2e-mm-01-smoke-e2e-admin-main.spec.ts` (cùng dạng luồng dài SETUP → Requestor → Approver →
Steward → cleanup ở suite khác) cũng không re-navigate ở cleanup, xác nhận đây là pattern an
toàn. Các spec khác trong cùng suite (`fr-e2e-mm-04/06/08/09/10`) vẫn giữ nguyên
`adminPage.goto()` (có comment "session may have expired") — nếu về sau việc bỏ re-navigate ở
`fr-e2e-mm-07` gây lỗi session hết hạn, đó là dấu hiệu cần khôi phục lại bước goto, không phải
lỗi ở chỗ khác.

---

# Nhóm F — Phương pháp debug flaky test

Đúc kết từ các bài học lặp lại nhiều lần trong toàn file (đặc biệt [Mục 5a](#5a-mở-cr-detail-từ-list-không-có-retryreload-giống-lỗi-mục-4-nhưng-ở-chỗ-khác)
và [Mục 16](#mục-16)) — đây là **quy trình làm việc**, áp dụng được cho bất kỳ dự án Playwright
nào, không riêng SimpleMDG.

1. **Phân loại triệu chứng trước khi sửa: fail ngẫu nhiên 1/N lần, hay fail ĐỀU 100% mọi lần
   thử?** Đây là tín hiệu chẩn đoán quan trọng nhất, hay bị bỏ qua:
   - Fail ngẫu nhiên 1 phần các lần → race condition/timing thật (Nhóm A) — tăng timeout/polling
     là hướng đúng.
   - Fail đều 100% qua mọi lần retry → **chính vòng retry không tạo ra khác biệt gì** giữa các
     lần thử (vd click lại đúng tab đang active — [Mục 16](#mục-16) v2→v3), hoặc 1 trạng thái
     treo cố định từ TRƯỚC vòng retry (dialog/blocklayer chưa đóng — [Mục 16](#mục-16) v1→v2).
     Tăng timeout/số lần thử ở đây vô nghĩa nếu không sửa đúng cơ chế.

2. **Khi 1 fix "nhìn có vẻ đúng về logic" vẫn tiếp tục fail — hoặc khi cùng 1 lỗi tái phát ở 1
   spec khác sau khi đã fix — DỪNG LẠI, đừng viết thêm 1 giả thuyết mới trên giấy.** Lấy bằng
   chứng thật trước:
   - Mở `test-results/<tên-test>*/test-failed-1.png` — xem app đang ở đúng trạng thái nào lúc
     fail (đúng trang/tab? dialog nào còn mở? giá trị field là gì?).
   - Nếu có `trace.zip`: `unzip trace.zip` rồi đọc trực tiếp `test.trace` (JSON Lines) — record
     `type:"before"` có field `title` (tên action: `Click ...`, `Fill ...`, `Navigate to ...`) và
     `stack[].line` (dòng code gọi action đó) — cho biết chính xác chuỗi hành động thật đã chạy,
     không cần GUI `npx playwright show-trace`.
   - **Lưu ý cấu hình `trace` trong `playwright.config.ts`:** nếu là `'on-first-retry'`, lần fail
     ĐẦU TIÊN chỉ có screenshot, KHÔNG có trace — trace.zip luôn thuộc về lần RETRY (có thể đã
     fail vì 1 lý do hoàn toàn khác). Đối chiếu CR number/timeline trong trace với đúng lỗi đang
     xem trước khi kết luận, đừng suy luận cho attempt 1 chỉ dựa vào trace của attempt 2. Nếu cần
     trace đầy đủ cho lần fail đầu, tạm đổi `trace: 'on'` hoặc `'retain-on-failure'` trong lúc
     điều tra.
   - `retries` > 0 trong config nghĩa là 1 test có thể "flaky ở attempt 1 nhưng pass/fail-khác ở
     attempt 2" — báo lỗi cuối cùng hiển thị cho người dùng có thể không phản ánh đúng những gì
     xảy ra ở attempt đầu.

3. **Đối chiếu với 1 testcase khác trong cùng project có flow tương tự đang PASS ổn định** — so
   sánh từng bước xem nó gọi API/locator nào khác với chỗ đang fail. Đây là cách nhanh nhất lộ ra
   sai lệch nhỏ nhưng chí mạng (vd [Mục 5a](#5a-mở-cr-detail-từ-list-không-có-retryreload-giống-lỗi-mục-4-nhưng-ở-chỗ-khác):
   1 locator xác nhận trang load sai loại phần tử, thiếu đúng 1 dòng "chờ settle trước khi click"
   — không cách nào đoán ra được nếu chỉ nhìn code tự viết một mình).

4. **Đừng tự viết lại (yếu hơn) 1 thao tác điều hướng/search mà project đã có sẵn page object xử
   lý ổn định.** Trước khi tự viết `click` + `fill` + `waitForSelector` thủ công cho 1 hành vi
   "quen thuộc", grep xem đã có method nào trong `pages/*.ts` làm đúng việc này chưa — nếu có, gọi
   lại nó (`new PageObject(page)` không tốn kém). Tự viết lại thường bỏ sót các edge case
   (blocklayer, popup, cached view) mà method gốc đã phải vá qua nhiều lần trước đó.

5. **Sau khi tìm ra 1 root cause, grep theo ĐOẠN CODE/LOCATOR ĐẶC TRƯNG của nguyên nhân** (vd
   `sapMTableTBody > tr.sapMListTblRow` cho "nơi tương tác F4 SelectDialog"), KHÔNG chỉ theo tên
   method hay thông báo lỗi cụ thể — cùng 1 root cause có thể biểu hiện thành nhiều TRIỆU CHỨNG
   khác nhau tùy hành động chạy tiếp theo (xem [Mục 12](#mục-12): "pointer events bị chặn" vs
   "field rỗng vì giá trị chưa kịp commit" — cùng nguyên nhân, 2 thông báo lỗi khác hẳn nhau).

6. **Sau khi fix, chạy lại toàn bộ suite bị ảnh hưởng ở cả 2 môi trường** (terminal local + CI/
   Automation Hub, hoặc môi trường tải thấp/cao tương đương) để xác nhận không gây regression —
   nhiều lỗi trong file này chỉ lộ ra dưới tải cao, nên chỉ test ở local là không đủ để xác nhận.

---

# Checklist tổng hợp theo nhóm

## Nhóm A — Timing & Polling
- [ ] Grep pattern search-icon `.click()` ngay sau `.fill()` trên toàn bộ page objects → đổi
      sang `.press('Enter')` để tránh flaky trên CI/headless. ([Mục 4](#mục-4))
- [ ] Grep pattern "click CR link → expect label visible" không có vòng lặp retry ở TẤT CẢ
      helper/page object. Gom về 1 helper dùng chung có retry thay vì copy-paste riêng lẻ. LƯU Ý:
      khi thêm `page.reload()` vào retry loop, PHẢI check lại locator điều hướng ban đầu còn hiển
      thị hay không trước khi click lại — reload() chỉ reload đúng route hiện tại, không tự đưa
      về trang list nơi link đó tồn tại. ([Mục 5a](#5a-mở-cr-detail-từ-list-không-có-retryreload-giống-lỗi-mục-4-nhưng-ở-chỗ-khác))
- [ ] Grep pattern "không tìm thấy sau N lần thử → log warning → bỏ qua/continue → vẫn báo tổng
      kết thành công" → đổi thành throw lỗi ngay tại chỗ, tránh lỗi thật bị che giấu và chỉ lộ ra
      muộn ở 1 bước hoàn toàn khác. ([Mục 5b](#5b-select-from-my-files--search-backend-chậm-bị-coi-là-not-found-rồi-âm-thầm-bỏ-qua))
- [ ] Rà các chỗ chờ toast/xác nhận sau khi submit bằng `waitForTimeout` cố định → thêm
      `waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden' })` trước khi chờ toast, để
      thời gian chờ co giãn theo tải thực tế thay vì timeout cứng. ([Mục 5c](#5c-toast-xác-nhận-cr-bị-miss-do-timeout-cứng-không-theo-busy-indicator))
- [ ] Với các nút action quan trọng (Submit, Approve, Confirm...) được click ngay sau 1 bước vừa
      load/re-render form (reopen draft, edit, resubmit) → thêm `expect(btn).toBeEnabled({
      timeout: 30000 })` TRƯỚC khi click, không chỉ dựa vào actionability timeout mặc định của
      `.click()`. "Resolve được nhưng disabled" khác hẳn "not found" và cần wait riêng. ([Mục 6](#mục-6))
- [ ] Với các bước "chờ trạng thái cuối cùng sau 1 tác vụ MASS xử lý nhiều item" → dùng polling
      với timeout dài (2-4 phút), không phải 1 lần `expect().toBeVisible()` timeout ngắn. Đối
      chiếu các hàm chờ status tương tự khác trong cùng codebase để biết mức timeout hợp lý thay
      vì đoán. KHÔNG thêm `page.reload()` vào vòng poll trừ khi đã xác nhận view không tự cập
      nhật — reload lặp lại nhiều lần có thể làm vỡ SPA (trang trắng vĩnh viễn). ([Mục 7](#mục-7))
- [ ] Sau khi fix 1 timeout quá ngắn cho backend xử lý mass, đọc HẾT cả hàm chứa nó — tìm các
      nhánh if/else khác xử lý cùng loại chờ nhưng dùng timeout khác nhau (dấu hiệu "đã vá 1 chỗ,
      quên vá chỗ song song"). ([Mục 8](#mục-8))
- [ ] Sau khi fix 1 timeout không nhất quán, grep tên method/đoạn code đặc trưng đó trên TOÀN BỘ
      `pages/` — cùng 1 lỗi hay bị copy-paste sang nhiều page object khác nhau, không chỉ nhiều
      hàm trong cùng 1 file. ([Mục 10](#mục-10))
- [ ] Khi 1 section/field không render kịp sau khi mở CR detail, xem screenshot lúc fail TRƯỚC
      khi kết luận "thiếu bước điều hướng (tab/scroll)" — nếu trang đã đúng vị trí, đây vẫn là bài
      toán timeout, không phải thiếu logic. ([Mục 11](#mục-11))
- [ ] Với bước điều hướng/click ngay SAU `loginAs()`/`goto()` đầu tiên của 1 role, chờ theo tín
      hiệu thực tế (busy indicator, hoặc chính element sắp click với timeout dài) — đừng dùng
      `waitForTimeout` cố định. Bootstrap lần đầu của app luôn chậm hơn các lần điều hướng sau.
      ([Mục 15](#mục-15))

## Nhóm B — Dialog / Popup / Tab lifecycle
- [ ] Khi gặp "subtree intercepts pointer events", đừng chỉ nhìn tại chỗ click bị chặn — tìm 1
      dialog/SelectDialog mở TRƯỚC ĐÓ nhiều bước mà chỉ đóng "về UI", chưa chờ backdrop/animation
      hoàn tất. Luôn chờ tường minh dialog + block layer chuyển `hidden` sau khi tương tác, không
      dùng `waitForTimeout` cố định. ([Mục 12](#mục-12))
- [ ] Grep các hàm `goto()`/điều hướng tab khác (`MyRequestPage`, `MassInboxPage`,
      `MassActivationPage`...) xem có đang `navigateTo()` rồi `expect().toBeVisible()` đúng 1 lần,
      không retry — nếu có, bọc lại bằng vòng retry click tab kiểu "switch away rồi quay lại"
      (không dùng `page.reload()`). ([Mục 16](#mục-16))
- [ ] `.catch(() => {})` best-effort trên 1 click dùng để ĐÓNG dialog/toast → luôn gọi thêm
      `closeBlockingPopup()` ngay sau đó, không chỉ tin vào việc click đã ăn — best-effort có thể
      để lại blocklayer treo ảnh hưởng MỌI hành động ở bước sau. ([Mục 16](#mục-16))

## Nhóm C — Locator & Assertion
- [ ] Khi gặp `element is not enabled`/`not visible` mà locator vẫn resolve ra đúng 1 element →
      kiểm tra id/class trong log lỗi trước khi tăng timeout. Hậu tố `__cloneNNN` hoặc class
      `*Dsbl` là dấu hiệu click nhầm UI5 clone element — cần scope locator hẹp hơn (vào đúng
      row/container), không phải chờ lâu hơn. ([Mục 9](#mục-9))
- [ ] Grep `isVisible({ timeout:` + `expect(...).toBeFalsy()/.toBe(true/false)` ngay sau đó — đây
      là anti-pattern check tức thời, không polling. Đổi sang
      `expect(locator).toBeVisible()/.not.toBeVisible()` (web-first assertion, tự động retry).
      Dấu hiệu nhận biết: "pass khi test tay, chỉ fail khi automation chạy nhanh liên tục". ([Mục 14](#mục-14))
- [ ] Khi thấy log "error dialog"/cảnh báo xuất hiện cả trên luồng THÀNH CÔNG, đừng coi là nhiễu
      vô hại — kiểm tra locator phát hiện lỗi có quá rộng không (vd `[role="dialog"]` khớp nhầm
      dialog bình thường thay vì chỉ `[role="alertdialog"]`), và xem false positive đó có khiến
      code `return`/skip bước quan trọng nào không. ([Mục 14](#mục-14))

## Nhóm D — Giới hạn dữ liệu (chỉ tham khảo cách làm, xác nhận lại số liệu)
- [ ] Grep `generateMMTimestamp` trong `suites/*/suite.config.ts` → suite nào có check Duplicate
      bật mà chưa dùng `generateUniqueMMTimestamp` thì đổi sang. ([Mục 1](#mục-1))
- [ ] Xác nhận lại (không giả định) giới hạn ký tự thực tế của các field hay dùng timestamp trên
      hệ thống đích. ([Mục 2](#mục-2))
- [ ] Đặt clamp giới hạn ký tự tại đúng 1 điểm trung tâm (page object method), không sửa rải rác
      từng spec. Khi clamp giá trị có random suffix, luôn cắt bớt phần ĐẦU (giữ đuôi). ([Mục 3](#mục-3))
- [ ] Kiểm tra lại TẤT CẢ field khác có giới hạn ký tự cứng mà nhận giá trị build từ timestamp —
      tăng độ dài timestamp ở 1 chỗ có thể làm vỡ field khác dùng chung giá trị đó ở nơi khác
      (hiệu ứng domino). ([Mục 3](#mục-3))

## Nhóm E — Lỗi call-site
- [ ] Khi gặp lỗi label sai loại object (vd chờ "Business Partner" nhưng template là Product) →
      kiểm tra call site có quên truyền tham số `confirmLabel`/tương đương không TRƯỚC khi nghi
      ngờ page object. Đối chiếu cách gọi ở các testcase khác cùng loại template để xác nhận đây
      là lỗi cục bộ 1 chỗ hay lỗi lan rộng trong hàm dùng chung. ([Mục 13](#mục-13))

## Nhóm F — Phương pháp debug (quy trình, áp dụng luôn)
- [ ] Phân loại fail ngẫu nhiên 1/N lần (race/timing → Nhóm A) hay fail ĐỀU 100% mọi lần retry
      (bug ở chính vòng retry, hoặc trạng thái treo từ trước → Nhóm B) trước khi chọn hướng fix.
- [ ] Khi 1 fix có vẻ đúng vẫn fail, hoặc lỗi tái phát ở spec khác → mở
      `test-results/<tên-test>*/test-failed-1.png` + `trace.zip` (unzip, đọc `test.trace` JSON
      Lines) của đúng lần fail đó TRƯỚC KHI viết thêm giả thuyết mới. Nhớ `trace:
      'on-first-retry'` (nếu config như vậy) nghĩa là lần fail đầu chỉ có screenshot, trace.zip
      luôn của lần retry — đối chiếu CR number/timeline để chắc khớp đúng lỗi đang xem.
- [ ] Đối chiếu với 1 testcase khác cùng project, cùng flow, đang PASS ổn định — so sánh từng
      bước xem nó gọi API/locator nào khác — nhanh hơn nhiều so với tiếp tục đoán và tự vá thêm.
- [ ] Trước khi tự viết `click`+`fill`+`waitForSelector` thủ công cho 1 hành vi "quen thuộc" (mở
      tab, search list...), grep xem đã có method nào trong `pages/*.ts` làm đúng việc này chưa.
- [ ] Sau khi tìm ra 1 root cause, grep theo **đoạn code/locator đặc trưng của nguyên nhân**
      (không chỉ theo tên method/thông báo lỗi cụ thể) — cùng root cause có thể biểu hiện thành
      nhiều triệu chứng khác nhau tùy hành động chạy tiếp theo.
- [ ] Sau khi fix, chạy lại toàn bộ suite bị ảnh hưởng ở cả 2 môi trường (terminal local +
      CI/Automation Hub) để xác nhận không gây regression — nhiều lỗi trong file này chỉ lộ ra
      dưới tải cao.
