// Step-by-step entries: one question at a time, then a review screen with Save.
//
// This file only shows and hides parts of the existing entry forms. Saving, validation,
// the "discard unsaved changes?" check and every database call stay in app-mobile.js,
// so an entry saved through the steps is exactly the same as one saved from the full form.
// Its own controls sit outside the <form>, so they never count as unsaved changes.
(function () {
  'use strict';

  const amountText = (value) =>
    value === '' || value == null ? '' : `Rs. ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  // Each flow lists its questions in the order they are asked. A step names the field it
  // asks for (f) and anything shown alongside it (with). Fields in "review" are asked on
  // the last screen, under the summary, next to Save.
  const FLOWS = {
    receiptForm: {
      edit: '#receiptId',
      steps: [
        { q: 'Which project is this payment for?', short: 'Project', f: '#receiptProject', auto: true },
        { q: 'How much did they pay?', short: 'Amount', f: '#receiptAmount', money: true },
        { q: 'Where did the money go?', short: 'Received in', f: '#receiptAccount', auto: true },
      ],
      review: ['#receiptDate', '#receiptDetails'],
    },
    orderReceiptForm: {
      edit: '#orderReceiptId',
      steps: [
        { q: 'Which order is this payment for?', short: 'Order', f: '#orderReceiptOrder', auto: true },
        { q: 'How much did they pay?', short: 'Amount', f: '#orderReceiptAmount', money: true },
        { q: 'Where did the money go?', short: 'Received in', f: '#orderReceiptAccount', auto: true },
      ],
      review: ['#orderReceiptDate', '#orderReceiptDetails'],
    },
    purchasePaymentForm: {
      steps: [
        { q: 'Which supplier did you pay?', short: 'Supplier', f: '#purchasePaymentSupplier', auto: true },
        { q: 'How much did you pay?', short: 'Amount', f: '#purchasePaymentAmount', money: true },
        { q: 'Paid from which account?', short: 'Paid from', f: '#purchasePaymentAccount', auto: true },
      ],
      review: ['#purchasePaymentDate', '#purchasePaymentDetails'],
    },
    payAdvanceForm: {
      edit: '#payAdvanceId',
      steps: [
        { q: 'Who is the advance for?', short: 'Labour person', f: '#payAdvanceLabourer', auto: true },
        { q: 'How much advance?', short: 'Amount', f: '#payAdvanceAmount', money: true },
        { q: 'Paid from which account?', short: 'Paid from', f: '#payAdvanceAccount', auto: true },
      ],
      review: ['#payAdvanceDate', '#payAdvanceDetails'],
    },
    payWagesForm: {
      steps: [
        { q: 'Who are you paying?', short: 'Labour person', f: '#payWagesLabourer', auto: true },
        { q: 'How much are you settling?', short: 'Amount', f: '#payWagesAmount', money: true, with: ['#unpaidWageLines', '.wage-summary'] },
        { q: 'Paid from which account?', short: 'Paid from', f: '#payWagesAccount', auto: true },
      ],
      review: ['#payWagesDate', '#payWagesDetails'],
    },
    purchaseForm: {
      steps: [
        { q: 'Bought from which supplier?', short: 'Supplier', f: '#purchaseSupplier', auto: true },
        {
          q: 'What is on the bill?',
          short: 'Items',
          with: ['.invoice-lines-head', '#purchaseLines', '#addPurchaseLine', '.totals-card'],
          check: (form) => (form.querySelector('#purchaseLines .invoice-line') ? '' : 'Add at least one material.'),
          summary: (form) => {
            const lines = form.querySelectorAll('#purchaseLines .invoice-line').length,
              total = form.querySelector('#purchaseGrandTotal')?.textContent || '';
            return `${lines} item${lines === 1 ? '' : 's'} · ${total}`;
          },
        },
        { q: 'Paid from which account?', short: 'Paid from', f: '#cashPurchaseAccount', auto: true },
      ],
      review: ['#purchaseDate', '[data-toggle-details="purchaseDetailsWrap"]', '#purchaseDetailsWrap'],
    },

    // ---------- Sprint 3: the remaining entries ----------
    labourAssignmentForm: {
      steps: [
        { q: 'Which project did they work on?', short: 'Project', f: '#labourAssignmentProject', auto: true },
        { q: 'Who worked?', short: 'Labour person', f: '#labourAssignmentPerson', auto: true },
        { q: 'How many days did they work?', short: 'Days', f: '#labourDayType', with: ['#labourAssignmentRate', '#labourActualCost'] },
      ],
      review: ['#labourAssignmentDate', '#labourAssignmentDetails'],
    },
    orderLabourForm: {
      steps: [
        { q: 'Which order did they work on?', short: 'Order', f: '#orderLabourOrder', auto: true },
        { q: 'Who worked?', short: 'Labour person', f: '#orderLabourPerson', auto: true },
        { q: 'How many days did they work?', short: 'Days', f: '#orderLabourDay', with: ['#orderLabourRate', '#orderLabourTotal'] },
      ],
      review: ['#orderLabourDate', '#orderLabourDetails'],
    },
    materialAssignmentForm: {
      steps: [
        { q: (form) => (isReturn(form, '#materialAssignmentMode') ? 'Which project is the material coming back from?' : 'Which project is the material for?'),
          short: 'Project', f: '#materialAssignmentProject', auto: true },
        { q: (form) => (isReturn(form, '#materialAssignmentMode') ? 'What came back?' : 'What material went to the job?'), short: 'Materials',
          with: ['#materialAssignmentImport', '.invoice-lines-head', '#materialAssignmentLines', '#materialAssignmentAddWrap'],
          summary: (form) => materialSummary(form, '#materialAssignmentLines') },
      ],
      review: ['#materialAssignmentDate'],
    },
    orderMaterialForm: {
      steps: [
        { q: (form) => (isReturn(form, '#orderMaterialMode') ? 'Which order is the material coming back from?' : 'Which order is the material for?'),
          short: 'Order', f: '#orderMaterialOrder', auto: true },
        { q: (form) => (isReturn(form, '#orderMaterialMode') ? 'What came back?' : 'What material went to the order?'), short: 'Materials',
          with: ['#orderMaterialImport', '.invoice-lines-head', '#orderMaterialLines', '#orderMaterialAddWrap'],
          summary: (form) => materialSummary(form, '#orderMaterialLines') },
      ],
      review: ['#orderMaterialDate'],
    },
    expenseChargeForm: {
      steps: [
        { q: 'Which project is the expense for?', short: 'Project', f: '#expenseChargeProject', auto: true },
        { q: 'What was it spent on?', short: 'Expense', f: '#expenseChargeCategory', auto: true },
        { q: 'How much was it?', short: 'Amount', f: '#expenseChargeAmount', money: true },
      ],
      review: ['#expenseChargeDate', '#expenseChargeDetails'],
    },
    orderExpenseChargeForm: {
      steps: [
        { q: 'Which order is the expense for?', short: 'Order', f: '#orderExpenseOrder', auto: true },
        { q: 'What was it spent on?', short: 'Expense', f: '#orderExpenseCategory', auto: true },
        { q: 'How much was it?', short: 'Amount', f: '#orderExpenseAmount', money: true },
      ],
      review: ['#orderExpenseDate', '#orderExpenseDetails'],
    },
    bankingExpenseForm: {
      steps: [
        { q: 'What was it spent on?', short: 'Expense', f: '#bankingExpenseCategory', auto: true },
        { q: 'How much was it?', short: 'Amount', f: '#bankingExpenseAmount', money: true },
        { q: 'Paid from which account?', short: 'Paid from', f: '#bankingExpenseAccount', auto: true },
      ],
      review: ['#bankingExpenseDate', '#bankingExpenseDetails'],
    },
    partnerDrawingForm: {
      edit: '#partnerDrawingId',
      steps: [
        { q: 'How much was taken?', short: 'Amount', f: '#partnerDrawingAmount', money: true },
        { q: 'Taken from which account?', short: 'From', f: '#partnerDrawingAccount', auto: true },
      ],
      review: [':scope > label:first-of-type', '#partnerDrawingDate', '#partnerDrawingDetails'],
    },
    bankTransferForm: {
      steps: [
        { q: (form) => ({ withdraw: 'Which bank did you take cash out of?', deposit: 'Which cash account did the money come from?' })[modeOf(form, '#bankTransferMode')] || 'From which bank?',
          short: 'From', f: '#bankTransferFrom', auto: true },
        { q: (form) => ({ withdraw: 'Which cash account did it go into?', deposit: 'Which bank did you deposit into?' })[modeOf(form, '#bankTransferMode')] || 'To which bank?',
          short: 'To', f: '#bankTransferTo', auto: true },
        { q: 'How much?', short: 'Amount', f: '#bankTransferAmount', money: true },
      ],
      review: ['#bankTransferDate', '#bankTransferDetails'],
    },
    scopeForm: {
      steps: [
        { q: 'Which project changed?', short: 'Project', f: '#scopeProject', auto: true },
        { q: 'Is the work increasing or decreasing?', short: 'Change', f: '#scopeType', auto: true },
        { q: 'By how much does the bill change?', short: 'Amount', f: '#scopeAmount', money: true },
      ],
      review: ['#scopeDate', '#scopeDescription'],
    },
    quoteForm: {
      steps: [
        { q: 'Which project is this quote for?', short: 'Project', f: '#quoteProjectSearch' },
        { q: 'What is included in the work?', short: 'Work', f: '#quoteDetails' },
        { q: 'When will the work happen?', short: 'Dates', f: '#quoteStart', with: ['#quoteEnd'],
          summary: (form) => [form.querySelector('#quoteStart').value, form.querySelector('#quoteEnd').value].filter(Boolean).join(' → ') +
            (form.querySelector('#quoteDays').value ? ` · ${form.querySelector('#quoteDays').value} days` : '') },
        { q: 'What is the price?', short: 'Price', f: '#quoteWithMaterial', with: ['#quoteShowBoth'],
          summary: (form) => [['With material', '#quoteWithMaterial'], ['Without material', '#quoteWithoutMaterial']]
            .filter(([, sel]) => form.querySelector(sel).value).map(([label, sel]) => `${label} ${amountText(form.querySelector(sel).value)}`).join(' · ') },
        { q: 'Payment terms and other details', short: 'Terms', f: '#quotePaymentTerms', with: ['#quoteNotes'] },
      ],
      review: [],
    },
    orderInvoiceForm: {
      steps: [
        { q: 'Who is the customer?', short: 'Customer', f: '#orderInvoiceCustomer', with: ['#orderInvoiceMobile'],
          summary: (form) => [form.querySelector('#orderInvoiceCustomer').value, form.querySelector('#orderInvoiceMobile').value].filter(Boolean).join(' · ') },
        {
          q: 'What is in the order?',
          short: 'Items',
          with: ['.invoice-lines-head', '#orderInvoiceLines', '#addOrderInvoiceLine', '.totals-card'],
          check: (form) => (form.querySelector('#orderInvoiceLines .invoice-line') ? '' : 'Add at least one item.'),
          summary: (form) => {
            const lines = form.querySelectorAll('#orderInvoiceLines .invoice-line').length,
              total = form.querySelector('#orderInvoiceGrandTotal')?.textContent || '';
            return `${lines} item${lines === 1 ? '' : 's'} · ${total}`;
          },
        },
      ],
      review: ['#orderInvoiceDate'],
    },
  };

  function modeOf(form, selector) {
    return form.querySelector(selector)?.value || '';
  }
  function isReturn(form, selector) {
    return modeOf(form, selector) === 'return';
  }
  function materialSummary(form, linesSelector) {
    const names = Array.from(form.querySelectorAll(`${linesSelector} .invoice-line select`))
      .map((sel) => (sel.value ? (sel.selectedOptions[0]?.textContent || '').split(' - ')[0].trim() : ''))
      .filter(Boolean);
    if (!names.length) return '';
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  }

  const flows = new Map();

  // The direct child of the form that holds a field (usually its <label>).
  function unitOf(form, selector) {
    let node = form.querySelector(selector);
    if (!node) return null;
    while (node.parentElement && node.parentElement !== form) node = node.parentElement;
    return node.parentElement === form ? node : null;
  }
  const isHidden = (node) => !node || node.hidden || node.classList.contains('hidden');

  function stepUnits(form, step) {
    return [step.f, ...(step.with || [])].filter(Boolean).map((s) => unitOf(form, s)).filter(Boolean);
  }
  function unavailable(form, step) {
    if (!step.f) return false;
    const field = form.querySelector(step.f),
      unit = unitOf(form, step.f);
    return !field || !unit || isHidden(unit) || field.disabled;
  }
  function onlyChoice(form, step) {
    const field = step.f ? form.querySelector(step.f) : null;
    return !!field && field.tagName === 'SELECT' && !!field.value && Array.from(field.options).filter((o) => o.value).length === 1;
  }
  // A list that opens with its only possible answer already chosen is not asked.
  // Decided once when the entry opens, so the step count doesn't change as you answer.
  function skipped(form, step) {
    const flow = flows.get(form.id);
    return unavailable(form, step) || !!(flow && flow.fixed && flow.fixed.has(step));
  }
  function labelText(form, step) {
    return step.short || (unitOf(form, step.f)?.firstChild?.textContent || '').replace('*', '').trim();
  }
  function valueText(form, step) {
    if (step.summary) return step.summary(form);
    const field = form.querySelector(step.f);
    if (!field) return '';
    if (field.tagName === 'SELECT') return field.selectedOptions[0]?.textContent?.trim() || '';
    return step.money ? amountText(field.value) : field.value;
  }

  function build(form, config) {
    const sheet = form.closest('.sheet');
    const head = document.createElement('div');
    head.className = 'es-head es-off';
    head.setAttribute('aria-live', 'polite');
    head.innerHTML =
      '<div class="es-progress" aria-hidden="true"><span></span></div><p class="es-count"></p><h3 class="es-q"></h3>' +
      '<p class="es-error" hidden></p><div class="es-summary" hidden></div>';
    form.before(head);
    const nav = document.createElement('div');
    nav.className = 'es-nav es-off';
    nav.innerHTML =
      '<button class="button secondary es-back" type="button">Back</button><button class="button primary es-next" type="button">Next</button>';
    form.after(nav);
    const flow = { form, sheet, config, head, nav, index: 0, active: false };
    nav.querySelector('.es-back').addEventListener('click', () => move(flow, -1));
    nav.querySelector('.es-next').addEventListener('click', () => next(flow));
    form.addEventListener('keydown', (event) => {
      if (!flow.active || event.key !== 'Enter' || event.target.tagName === 'TEXTAREA') return;
      if (flow.index >= config.steps.length) return;
      event.preventDefault();
      next(flow);
    });
    form.addEventListener('change', (event) => {
      if (!flow.active || flow.index >= config.steps.length) return;
      const step = config.steps[flow.index];
      if (step.auto && step.f && event.target.matches(step.f) && event.target.value) setTimeout(() => next(flow), 160);
    });
    flows.set(form.id, flow);
    return flow;
  }

  function showOnly(flow, units, showActions) {
    const keep = new Set(units);
    Array.from(flow.form.children).forEach((child) => {
      if (child.matches('input[type="hidden"]')) return;
      const isActions = child.classList.contains('form-actions') || child.classList.contains('stack-actions');
      child.classList.toggle('es-off', isActions ? !showActions : !keep.has(child));
    });
  }

  function render(flow) {
    const { form, config, head, nav } = flow,
      steps = config.steps,
      total = steps.filter((s) => !skipped(form, s)).length + 1,
      onReview = flow.index >= steps.length,
      position = onReview ? total : steps.slice(0, flow.index + 1).filter((s) => !skipped(form, s)).length;
    head.querySelector('.es-progress span').style.width = `${Math.round((position / total) * 100)}%`;
    head.querySelector('.es-count').textContent = `Step ${position} of ${total}`;
    head.querySelector('.es-error').hidden = true;
    const summary = head.querySelector('.es-summary');
    if (onReview) {
      head.querySelector('.es-q').textContent = 'Check and save';
      summary.hidden = false;
      summary.innerHTML = '';
      steps.forEach((step, i) => {
        if (unavailable(form, step)) return;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'es-row';
        row.innerHTML = '<span></span><b></b><small>Change</small>';
        row.querySelector('span').textContent = labelText(form, step);
        row.querySelector('b').textContent = valueText(form, step) || '—';
        if (flows.get(form.id)?.fixed?.has(step)) row.disabled = true;
        else row.addEventListener('click', () => go(flow, i));
        summary.append(row);
      });
      const reviewUnits = (config.review || []).map((s) => unitOf(form, s)).filter(Boolean);
      const notes = Array.from(form.querySelectorAll(':scope > .note'));
      showOnly(flow, reviewUnits.concat(notes), true);
      nav.classList.add('es-off');
    } else {
      const step = steps[flow.index];
      head.querySelector('.es-q').textContent = typeof step.q === 'function' ? step.q(form) : step.q;
      summary.hidden = true;
      showOnly(flow, stepUnits(form, step), false);
      nav.classList.remove('es-off');
      nav.querySelector('.es-back').hidden = position <= 1;
    }
    flow.sheet.scrollTop = 0;
    if (!onReview) focusStep(flow);
  }

  function focusStep(flow) {
    const step = flow.config.steps[flow.index];
    const field = step.f ? flow.form.querySelector(step.f) : null;
    if (!field) return;
    const target =
      field.tagName === 'SELECT' ? unitOf(flow.form, step.f)?.querySelector('.search-select-trigger') || field : field;
    try {
      target.focus({ preventScroll: true });
    } catch (e) {
      /* focus is a convenience only */
    }
  }

  function problem(flow) {
    const step = flow.config.steps[flow.index];
    if (step.check) {
      const message = step.check(flow.form);
      if (message) return { message };
    }
    for (const unit of stepUnits(flow.form, step)) {
      for (const field of unit.querySelectorAll('input,select,textarea')) {
        if (field.type === 'hidden' || field.disabled || field.closest('.hidden,[hidden]')) continue;
        if (!field.checkValidity()) return { message: field.validationMessage || 'Please fill this in.', field };
      }
    }
    return null;
  }

  function next(flow) {
    if (flow.index < flow.config.steps.length) {
      const issue = problem(flow);
      if (issue) {
        const error = flow.head.querySelector('.es-error');
        error.textContent = issue.message;
        error.hidden = false;
        if (issue.field) {
          try {
            issue.field.focus({ preventScroll: true });
          } catch (e) {
            /* ignore */
          }
        }
        return;
      }
    }
    move(flow, 1);
  }

  function move(flow, dir) {
    const steps = flow.config.steps;
    let i = flow.index + dir;
    while (i >= 0 && i < steps.length && skipped(flow.form, steps[i])) i += dir;
    if (i < 0) return;
    flow.index = Math.min(i, steps.length);
    render(flow);
  }
  function go(flow, index) {
    flow.index = index;
    render(flow);
  }

  function stop(flow) {
    flow.active = false;
    Array.from(flow.form.children).forEach((child) => child.classList.remove('es-off'));
    flow.head.classList.add('es-off');
    flow.nav.classList.add('es-off');
    flow.form.classList.remove('es-on');
  }
  function start(flow) {
    const title = (flow.sheet.querySelector('.sheet-head h2')?.textContent || '').trim();
    const editing = /^edit\b/i.test(title) || (flow.config.edit && flow.form.querySelector(flow.config.edit)?.value);
    stop(flow);
    if (editing) return; // editing an existing record keeps the full form
    flow.active = true;
    flow.fixed = new Set(flow.config.steps.filter((step) => onlyChoice(flow.form, step)));
    flow.form.classList.add('es-on');
    flow.head.classList.remove('es-off');
    flow.index = -1;
    move(flow, 1);
  }

  function init() {
    Object.entries(FLOWS).forEach(([id, config]) => {
      const form = document.getElementById(id),
        sheet = form?.closest('.sheet');
      if (!form || !sheet || flows.has(id)) return;
      const flow = build(form, config);
      let wasOpen = !sheet.classList.contains('hidden');
      new MutationObserver(() => {
        const open = !sheet.classList.contains('hidden');
        if (open && !wasOpen) start(flow); // openSheet runs after the form has been filled in
        if (!open && wasOpen) stop(flow);
        wasOpen = open;
      }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
    });
  }

  window.MughalSteps = { init, flows, FLOWS };
  // Loaded at the end of the page, so the forms already exist; the event is a fallback.
  init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
