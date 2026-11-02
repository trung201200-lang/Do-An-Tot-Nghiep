import React, { useEffect, useRef } from 'react';
import { Button } from './index';
import '../../styles/confirm-dialog.css';

// Native modal makes the background inert; keep Tab cycling through its actions.
export default function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Hủy', onCancel, onConfirm }) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal(); cancel.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={dialog} className="ui-confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p>
    <div className="actions"><Button ref={cancel} variant="secondary" onClick={onCancel}>{cancelLabel}</Button><Button onClick={onConfirm}>{confirmLabel}</Button></div>
  </dialog>;
}
