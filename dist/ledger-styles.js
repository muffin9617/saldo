// Fetch without applying global ledger rules to the welcome/auth/loading screens.
const pending = new Map();
const styles = [['ledger-style', '/ledger.css'], ['brand-style', '/brand-logos.css']];

function prepareStyle(id, href) {
  if (pending.has(id)) return pending.get(id);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.media = 'not all';
    let timer;
    const finish = error => {
      clearTimeout(timer);
      link.onload = link.onerror = null;
      if (error) {
        link.remove();
        pending.delete(id);
        reject(error);
      } else {
        link.dataset.ready = 'true';
        resolve(link);
      }
    };
    link.onload = () => finish();
    link.onerror = () => finish(new Error('LEDGER_STYLES_UNAVAILABLE'));
    timer = setTimeout(() => finish(new Error('LEDGER_STYLES_UNAVAILABLE')), 15000);
    link.href = href;
    document.head.append(link);
  });
  pending.set(id, promise);
  return promise;
}

export function prepareLedgerStyles() {
  return Promise.all(styles.map(([id, href]) => prepareStyle(id, href)));
}

export function activateLedgerStyles() {
  const links = styles.map(([id]) => document.getElementById(id));
  if (links.some(link => link?.dataset.ready !== 'true')) throw new Error('LEDGER_STYLES_UNAVAILABLE');
  // Activation and DOM mounting run in the same task, before the browser paints.
  links.forEach(link => { link.media = 'all'; });
}

export function deactivateLedgerStyles() {
  styles.forEach(([id]) => { const link = document.getElementById(id); if (link) link.media = 'not all'; });
}
