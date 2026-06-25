const bankPayload = window.SHUNTING_BANK || { meta: { counts: {} }, questions: [] };
const bankQuestions = bankPayload.questions || [];

const typeMeta = {
  single: { label: "单选题", short: "单选", mode: "single" },
  judge: { label: "判断题", short: "判断", mode: "single" },
  multi: { label: "多选题", short: "多选", mode: "multi" },
  fill: { label: "填空题", short: "填空", mode: "fill" },
};
const typeOrder = ["single", "judge", "multi", "fill"];
const wrongStorageKey = "shuntingRandomQuizWrongBook.v1";

const state = {
  view: "home",
  session: [],
  sessionTitle: "",
  sessionMode: "all",
  index: 0,
  draft: { choices: new Set(), fill: [] },
  records: [],
  stats: { correct: 0, wrong: 0 },
};

const els = {
  totalCount: document.querySelector("#totalCount"),
  wrongCount: document.querySelector("#wrongCount"),
  mainPanel: document.querySelector("#mainPanel"),
};

function questionKey(question) {
  return `${question.type}:${question.id}`;
}

function getWrongBook() {
  try {
    return JSON.parse(localStorage.getItem(wrongStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveWrongBook(book) {
  localStorage.setItem(wrongStorageKey, JSON.stringify(book));
  updateCounts();
}

function addWrong(question, record) {
  const book = getWrongBook();
  const key = questionKey(question);
  const item = book[key] || { type: question.type, id: question.id, count: 0, updatedAt: "", lastAnswer: null };
  item.count += 1;
  item.updatedAt = new Date().toISOString();
  item.lastAnswer = record.answer;
  book[key] = item;
  saveWrongBook(book);
}

function removeWrong(question) {
  const book = getWrongBook();
  delete book[questionKey(question)];
  saveWrongBook(book);
}

function findQuestion(type, id) {
  return bankQuestions.find((question) => question.type === type && question.id === id);
}

function getWrongEntries() {
  const book = getWrongBook();
  return Object.values(book)
    .map((item) => ({ item, question: findQuestion(item.type, item.id) }))
    .filter((entry) => entry.question)
    .sort((a, b) => {
      const typeDiff = typeOrder.indexOf(a.question.type) - typeOrder.indexOf(b.question.type);
      if (typeDiff) return typeDiff;
      return Number(a.question.id) - Number(b.question.id);
    });
}

function updateCounts() {
  els.totalCount.textContent = `题库 ${bankQuestions.length} 题`;
  els.wrongCount.textContent = `错题 ${getWrongEntries().length} 题`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeChoice(answer) {
  return [...(answer || [])].sort();
}

function answerSet(answer) {
  return new Set(normalizeChoice(answer));
}

function toHalfWidth(value) {
  return String(value || "")
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

function normalizeTextAnswer(value) {
  return toHalfWidth(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，,。．.；;：:“”"'‘’、]/g, "");
}

function expectedFillValues(question) {
  const blanks = question.blankAnswers || [];
  if (blanks.length) {
    return blanks.map((item) => item.value || "");
  }
  return question.answerText ? [question.answerText] : [""];
}

function blankLabels(question) {
  const blanks = question.blankAnswers || [];
  if (blanks.length) {
    return blanks.map((item, index) => item.label || `空${index + 1}`);
  }
  return ["空1"];
}

function currentQuestion() {
  return state.session[state.index];
}

function findRecord(question) {
  return state.records.find((record) => record.key === questionKey(question));
}

function getDraftAnswer(question = currentQuestion()) {
  if (!question) {
    return [];
  }
  if (typeMeta[question.type].mode === "fill") {
    return state.draft.fill.map((item) => String(item || "").trim());
  }
  return normalizeChoice(state.draft.choices);
}

function isFillAnswered(question, answer) {
  const expectedCount = expectedFillValues(question).length;
  return answer.length === expectedCount && answer.every((item) => String(item || "").trim());
}

function isQuestionAnswered(question, answer = getDraftAnswer(question)) {
  if (!question) {
    return false;
  }
  if (typeMeta[question.type].mode === "fill") {
    return isFillAnswered(question, answer);
  }
  return answer.length > 0;
}

function isCorrectAnswer(question, answer) {
  if (typeMeta[question.type].mode === "fill") {
    const expected = expectedFillValues(question);
    return (
      isFillAnswered(question, answer) &&
      expected.every((value, index) => normalizeTextAnswer(answer[index]) === normalizeTextAnswer(value))
    );
  }
  return normalizeChoice(answer).join("") === normalizeChoice(question.answer).join("");
}

function upsertCurrentRecord() {
  const question = currentQuestion();
  if (!question) {
    return;
  }
  const key = questionKey(question);
  const answer = getDraftAnswer(question);
  state.records = state.records.filter((record) => record.key !== key);
  if (!isQuestionAnswered(question, answer)) {
    return;
  }
  state.records.push({
    key,
    type: question.type,
    id: question.id,
    answer,
    correct: isCorrectAnswer(question, answer),
  });
}

function loadAnswerForIndex(index) {
  const question = state.session[index];
  const record = question ? findRecord(question) : null;
  if (!question) {
    state.draft = { choices: new Set(), fill: [] };
    return;
  }
  if (typeMeta[question.type].mode === "fill") {
    const expectedCount = expectedFillValues(question).length;
    const saved = Array.isArray(record?.answer) ? record.answer : [];
    state.draft = {
      choices: new Set(),
      fill: Array.from({ length: expectedCount }, (_, index) => saved[index] || ""),
    };
  } else {
    state.draft = {
      choices: answerSet(record?.answer || []),
      fill: [],
    };
  }
}

function answeredCount() {
  return state.records.length;
}

function unansweredCount() {
  return Math.max(state.session.length - answeredCount(), 0);
}

function canMoveNext() {
  return state.index < state.session.length - 1 && isQuestionAnswered(currentQuestion());
}

function canSubmitPaper() {
  return state.session.length > 0 && answeredCount() === state.session.length;
}

function formatChoiceAnswer(question, answer) {
  const letters = normalizeChoice(answer);
  if (!letters.length) {
    return "未作答";
  }
  return letters
    .map((key) => {
      const option = question.options.find((item) => item.key === key);
      return option ? `${key}. ${option.text}` : key;
    })
    .join("；");
}

function formatFillAnswer(question, answer) {
  const labels = blankLabels(question);
  const values = Array.isArray(answer) ? answer : [];
  if (!values.some((value) => String(value || "").trim())) {
    return "未作答";
  }
  return labels.map((label, index) => `${label}：${values[index] || ""}`).join("；");
}

function formatCorrectAnswer(question) {
  if (typeMeta[question.type].mode === "fill") {
    const labels = blankLabels(question);
    return expectedFillValues(question).map((value, index) => `${labels[index]}：${value}`).join("；");
  }
  return formatChoiceAnswer(question, question.answer);
}

function formatUserAnswer(question, answer) {
  if (typeMeta[question.type].mode === "fill") {
    return formatFillAnswer(question, answer);
  }
  return formatChoiceAnswer(question, answer);
}

function optionStatus(question, option, answer, revealAll = false) {
  const correctKeys = answerSet(question.answer);
  const selectedKeys = answerSet(answer);
  const isCorrectKey = correctKeys.has(option.key);
  const isSelected = selectedKeys.has(option.key);

  if (isSelected && !isCorrectKey) {
    return "wrong";
  }
  if (isSelected && isCorrectKey) {
    return "correct";
  }
  if (isCorrectKey && revealAll) {
    return typeMeta[question.type].mode === "multi" && answer?.length ? "missed" : "correct";
  }
  return "";
}

function statusLabel(correct) {
  return correct ? "答对" : "答错";
}

function typeSummary(type) {
  const records = state.records.filter((record) => record.type === type);
  const total = state.session.filter((question) => question.type === type).length;
  const correct = records.filter((record) => record.correct).length;
  const rate = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, wrong: total - correct, rate };
}

function renderHome() {
  const counts = bankPayload.meta?.counts || {};
  els.mainPanel.innerHTML = `
    <section class="home-view">
      <div class="rail-line" aria-hidden="true"></div>
      <h2 class="view-heading">全题随机练习</h2>
      <div class="summary-grid">
        <div class="summary-item"><strong>${bankQuestions.length}</strong><span>本次题量</span></div>
        <div class="summary-item"><strong>${counts.single || 0}</strong><span>单选题</span></div>
        <div class="summary-item"><strong>${counts.judge || 0}</strong><span>判断题</span></div>
        <div class="summary-item"><strong>${counts.multi || 0}</strong><span>多选题</span></div>
        <div class="summary-item"><strong>${counts.fill || 0}</strong><span>填空题</span></div>
      </div>
      <div class="action-row">
        <button class="primary-button" type="button" data-start-all>开始随机刷题</button>
        <button class="secondary-button" type="button" data-show-wrong>错题本</button>
        <button class="secondary-button" type="button" data-clear-wrong>清空错题</button>
      </div>
    </section>
  `;
}

function startSession(questions, title, mode = "all") {
  state.view = "quiz";
  state.session = shuffle(questions);
  state.sessionTitle = title;
  state.sessionMode = mode;
  state.index = 0;
  state.draft = { choices: new Set(), fill: [] };
  state.records = [];
  state.stats = { correct: 0, wrong: 0 };
  loadAnswerForIndex(0);
  render();
  els.mainPanel.focus();
}

function startAllSession() {
  startSession(bankQuestions, "随机练习", "all");
}

function renderQuiz() {
  const question = currentQuestion();
  if (!question) {
    renderHome();
    return;
  }
  const progress = Math.round(((state.index + 1) / state.session.length) * 100);
  const answer = getDraftAnswer(question);
  const canGoPrev = state.index > 0;
  const nextEnabled = canMoveNext();
  const canSubmit = canSubmitPaper();
  const unanswered = unansweredCount();

  els.mainPanel.innerHTML = `
    <section class="quiz-view">
      <div class="quiz-head">
        <div class="quiz-meta">
          <span class="pill">${state.sessionTitle}</span>
          <span class="pill">第 ${state.index + 1} / ${state.session.length} 题</span>
          <span class="pill">${typeMeta[question.type].label} ${escapeHtml(question.id)}</span>
          <span class="pill" data-answered-pill>已答 ${answeredCount()} / ${state.session.length}</span>
        </div>
        <div class="progress" aria-hidden="true"><span style="width: ${progress}%"></span></div>
      </div>

      <div class="question-card">
        <h2 class="question-title">${escapeHtml(question.question)}</h2>
        ${renderAnswerEditor(question, answer)}
        <div class="action-row">
          <button class="secondary-button" type="button" data-prev ${canGoPrev ? "" : "disabled"}>上一题</button>
          ${
            state.index < state.session.length - 1
              ? `<button class="primary-button" type="button" data-next ${nextEnabled ? "" : "disabled"}>下一题</button>`
              : ""
          }
          <button class="${canSubmit ? "primary-button" : "secondary-button"}" type="button" data-submit-paper ${canSubmit ? "" : "disabled"}>${canSubmit ? "交卷" : `还有 ${unanswered} 题未答`}</button>
          <button class="secondary-button" type="button" data-home>返回首页</button>
        </div>
      </div>
    </section>
  `;
}

function renderAnswerEditor(question, answer) {
  if (typeMeta[question.type].mode === "fill") {
    return renderFillInputs(question, answer);
  }
  return `
    <div class="options">
      ${question.options.map((option) => renderOption(question, option, answer, false)).join("")}
    </div>
  `;
}

function renderFillInputs(question, answer) {
  const labels = blankLabels(question);
  return `
    <div class="fill-area">
      ${labels
        .map(
          (label, index) => `
            <div class="fill-field">
              <label for="fill-${index}">${escapeHtml(label)}</label>
              <input class="fill-input" id="fill-${index}" type="text" value="${escapeAttribute(answer[index] || "")}" data-fill-input="${index}" autocomplete="off">
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOption(question, option, answer, revealAll) {
  const selected = answerSet(answer).has(option.key);
  const status = revealAll ? optionStatus(question, option, answer, true) : "";
  const className = [selected && !status ? "selected" : "", status].filter(Boolean).join(" ");
  const disabled = revealAll ? "disabled" : "";
  return `
    <button class="option-button ${className}" type="button" data-option="${option.key}" ${disabled}>
      <span class="option-key">${option.key}</span>
      <span>${escapeHtml(option.text)}</span>
    </button>
  `;
}

function renderReviewOption(question, option, answer) {
  const status = optionStatus(question, option, answer, true);
  const selected = answerSet(answer).has(option.key);
  const className = [selected && !status ? "selected" : "", status].filter(Boolean).join(" ");
  return `
    <div class="option-button review-option ${className}">
      <span class="option-key">${option.key}</span>
      <span>${escapeHtml(option.text)}</span>
    </div>
  `;
}

function updateQuizControls() {
  upsertCurrentRecord();
  const answeredPill = els.mainPanel.querySelector("[data-answered-pill]");
  if (answeredPill) {
    answeredPill.textContent = `已答 ${answeredCount()} / ${state.session.length}`;
  }
  const nextButton = els.mainPanel.querySelector("[data-next]");
  if (nextButton) {
    nextButton.disabled = !canMoveNext();
  }
  const submitButton = els.mainPanel.querySelector("[data-submit-paper]");
  if (submitButton) {
    const canSubmit = canSubmitPaper();
    submitButton.disabled = !canSubmit;
    submitButton.textContent = canSubmit ? "交卷" : `还有 ${unansweredCount()} 题未答`;
    submitButton.className = canSubmit ? "primary-button" : "secondary-button";
  }
}

function goToQuestion(index) {
  if (index < 0 || index >= state.session.length) {
    return;
  }
  upsertCurrentRecord();
  state.index = index;
  loadAnswerForIndex(index);
  render();
  els.mainPanel.focus();
}

function submitPaper() {
  upsertCurrentRecord();
  if (!canSubmitPaper()) {
    renderQuiz();
    return;
  }
  finalizeSessionRecords();
  state.view = "finish";
  render();
  els.mainPanel.focus();
}

function finalizeSessionRecords() {
  const correct = state.records.filter((record) => record.correct).length;
  const wrong = state.records.length - correct;
  state.stats = { correct, wrong };
  state.records.forEach((record) => {
    const question = findQuestion(record.type, record.id);
    if (!question) {
      return;
    }
    if (record.correct) {
      removeWrong(question);
    } else {
      addWrong(question, record);
    }
  });
}

function renderFinish() {
  const total = state.session.length;
  const correct = state.stats.correct;
  const wrong = state.stats.wrong;
  const rate = total ? Math.round((correct / total) * 100) : 0;
  els.mainPanel.innerHTML = `
    <section class="finish-view">
      <div class="rail-line" aria-hidden="true"></div>
      <div>
        <h2 class="view-heading">交卷完成</h2>
        <p class="subtle">${state.sessionTitle}，正确率 ${rate}%。</p>
      </div>
      <div class="summary-grid">
        <div class="summary-item"><strong>${total}</strong><span>本次题量</span></div>
        <div class="summary-item"><strong>${correct}</strong><span>答对</span></div>
        <div class="summary-item"><strong>${wrong}</strong><span>答错</span></div>
        <div class="summary-item"><strong>${rate}%</strong><span>正确率</span></div>
        <div class="summary-item"><strong>${getWrongEntries().length}</strong><span>错题本</span></div>
      </div>
      <div class="type-breakdown">
        ${typeOrder
          .map((type) => {
            const item = typeSummary(type);
            return `<span class="pill">${typeMeta[type].short}：${item.correct}/${item.total}，${item.rate}%</span>`;
          })
          .join("")}
      </div>
      <div class="legend-row" aria-label="颜色说明">
        <span><i class="legend-dot ok"></i>正确选项</span>
        <span><i class="legend-dot miss"></i>少选选项</span>
        <span><i class="legend-dot bad"></i>选错选项</span>
      </div>
      <div class="action-row sticky-actions">
        <button class="primary-button" type="button" data-start-all>再随机一套</button>
        <button class="secondary-button" type="button" data-show-wrong>错题本</button>
        <button class="secondary-button" type="button" data-home>返回首页</button>
      </div>
      <div class="review-list">
        ${state.session.map((question, index) => renderReviewItem(question, index)).join("")}
      </div>
    </section>
  `;
}

function renderReviewItem(question, index) {
  const record = findRecord(question) || { answer: [], correct: false };
  const statusClass = record.correct ? "ok" : "bad";
  return `
    <article class="review-item ${statusClass}">
      <div class="review-item-head">
        <div>
          <strong>${index + 1}. ${typeMeta[question.type].label} ${escapeHtml(question.id)}</strong>
          <span class="review-status ${statusClass}">${statusLabel(record.correct)}</span>
        </div>
        <div class="review-answer-line">
          <span>你的答案：${escapeHtml(formatUserAnswer(question, record.answer))}</span>
          <span>正确答案：${escapeHtml(formatCorrectAnswer(question))}</span>
        </div>
      </div>
      <p class="review-question">${escapeHtml(question.question)}</p>
      ${renderReviewBody(question, record)}
    </article>
  `;
}

function renderReviewBody(question, record) {
  if (typeMeta[question.type].mode === "fill") {
    const answerClass = record.correct ? "correct" : "wrong";
    return `
      <div class="fill-review">
        <span class="answer-chip ${answerClass}">你的填空：${escapeHtml(formatUserAnswer(question, record.answer))}</span>
        <span class="answer-chip correct">正确填空：${escapeHtml(formatCorrectAnswer(question))}</span>
      </div>
    `;
  }
  return `
    <div class="options review-options">
      ${question.options.map((option) => renderReviewOption(question, option, record.answer)).join("")}
    </div>
  `;
}

function renderWrongBook() {
  const entries = getWrongEntries();
  const list = entries
    .map(
      ({ item, question }) => `
        <article class="wrong-item">
          <div class="wrong-item-header">
            <span>${typeMeta[question.type].label} ${escapeHtml(question.id)} · 错 ${item.count} 次</span>
            <button class="secondary-button small-button" type="button" data-remove-wrong="${escapeAttribute(questionKey(question))}">移除</button>
          </div>
          <p>${escapeHtml(question.question)}</p>
          <p class="subtle">答案：${escapeHtml(formatCorrectAnswer(question))}</p>
        </article>
      `
    )
    .join("");

  els.mainPanel.innerHTML = `
    <section class="wrong-view">
      <div class="rail-line" aria-hidden="true"></div>
      <div>
        <h2 class="view-heading">错题本</h2>
        <p class="subtle">当前共 ${entries.length} 道错题。</p>
      </div>
      ${
        entries.length
          ? `<div class="action-row">
              <button class="primary-button" type="button" data-start-wrong>重刷错题</button>
              <button class="secondary-button" type="button" data-clear-wrong>清空错题</button>
              <button class="secondary-button" type="button" data-home>返回首页</button>
            </div>
            <div class="wrong-list">${list}</div>`
          : `<div class="empty-state">
              <h3>暂无错题</h3>
              <div><button class="primary-button" type="button" data-home>返回首页</button></div>
            </div>`
      }
    </section>
  `;
}

function clearWrongBook() {
  if (!getWrongEntries().length) {
    return;
  }
  if (confirm("确定清空错题本吗？")) {
    saveWrongBook({});
    render();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function render() {
  updateCounts();
  if (state.view === "quiz") {
    renderQuiz();
  } else if (state.view === "finish") {
    renderFinish();
  } else if (state.view === "wrong") {
    renderWrongBook();
  } else {
    renderHome();
  }
}

els.mainPanel.addEventListener("click", (event) => {
  const optionButton = event.target.closest("[data-option]");
  if (optionButton && state.view === "quiz") {
    const question = currentQuestion();
    const key = optionButton.dataset.option;
    if (typeMeta[question.type].mode === "multi") {
      if (state.draft.choices.has(key)) {
        state.draft.choices.delete(key);
      } else {
        state.draft.choices.add(key);
      }
    } else {
      state.draft.choices = new Set([key]);
    }
    upsertCurrentRecord();
    renderQuiz();
    return;
  }

  if (event.target.closest("[data-start-all]")) {
    startAllSession();
  } else if (event.target.closest("[data-prev]")) {
    goToQuestion(state.index - 1);
  } else if (event.target.closest("[data-next]")) {
    goToQuestion(state.index + 1);
  } else if (event.target.closest("[data-submit-paper]")) {
    submitPaper();
  } else if (event.target.closest("[data-show-wrong]")) {
    state.view = "wrong";
    render();
  } else if (event.target.closest("[data-start-wrong]")) {
    const questions = getWrongEntries().map((entry) => entry.question);
    if (questions.length) {
      startSession(questions, "错题练习", "wrong");
    }
  } else if (event.target.closest("[data-clear-wrong]")) {
    clearWrongBook();
  } else if (event.target.closest("[data-home]")) {
    state.view = "home";
    state.session = [];
    state.draft = { choices: new Set(), fill: [] };
    state.records = [];
    render();
  }

  const removeButton = event.target.closest("[data-remove-wrong]");
  if (removeButton) {
    const book = getWrongBook();
    delete book[removeButton.dataset.removeWrong];
    saveWrongBook(book);
    render();
  }
});

els.mainPanel.addEventListener("input", (event) => {
  const input = event.target.closest("[data-fill-input]");
  if (!input || state.view !== "quiz") {
    return;
  }
  const index = Number(input.dataset.fillInput);
  state.draft.fill[index] = input.value;
  updateQuizControls();
});

document.addEventListener("keydown", (event) => {
  if (state.view !== "quiz") {
    return;
  }
  if (event.target.matches("input, textarea")) {
    return;
  }
  const question = currentQuestion();
  if (!question || typeMeta[question.type].mode === "fill") {
    return;
  }
  const option = question.options.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
  if (!option) {
    return;
  }
  if (typeMeta[question.type].mode === "multi") {
    if (state.draft.choices.has(option.key)) {
      state.draft.choices.delete(option.key);
    } else {
      state.draft.choices.add(option.key);
    }
  } else {
    state.draft.choices = new Set([option.key]);
  }
  upsertCurrentRecord();
  renderQuiz();
});

render();
