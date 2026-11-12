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
  };

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
  function skipped(form, step) {
    if (!step.f) return false;
    const field = form.querySelector(step.f),
      unit = unitOf(form, step.f);
    return !field || !unit || isHidden(unit) || field.disabled;
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
      const isActions = child.classList.contains('form-actions');
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
        if (skipped(form, step)) return;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'es-row';
        row.innerHTML = '<span></span><b></b><small>Change</small>';
        row.querySelector('span').textContent = labelText(form, step);
        row.querySelector('b').textContent = valueText(form, step) || '—';
        row.addEventListener('click', () => go(flow, i));
        summary.append(row);
      });
      const reviewUnits = (config.review || []).map((s) => unitOf(form, s)).filter(Boolean);
      const notes = Array.from(form.querySelectorAll(':scope > .note'));
      showOnly(flow, reviewUnits.concat(notes), true);
      nav.classList.add('es-off');
    } else {
      const step = steps[flow.index];
      head.querySelector('.es-q').textContent = step.q;
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
    const editing = flow.config.edit && flow.form.querySelector(flow.config.edit)?.value;
    stop(flow);
    if (editing) return; // editing an existing record keeps the full form
    flow.active = true;
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
        if (open && !wasOpen) setTimeout(() => start(flow), 0); // after the form has been filled in
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
