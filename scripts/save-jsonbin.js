(async ()=>{
  try {
    const pin = '1234';
    const masterKey = '-$2a$10$tynMTmM4Vc2Bru7.mZrp0uDBL09JI/TccfanxpCFYjmY1qPNyepqC';
    const binId = '6a230171f5f4af5e29beeb2e';

    const login = await fetch('http://localhost:3000/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin})});
    const lj = await login.json();
    console.log('LOGIN', login.status, lj);
    if (!lj.token) throw new Error('No token');
    const hdr = { 'Authorization': 'Bearer ' + lj.token, 'Content-Type':'application/json' };

    const save = await fetch('http://localhost:3000/api/admin/jsonbin', { method: 'POST', headers: hdr, body: JSON.stringify({ key: masterKey, bin: binId }) });
    console.log('SAVE', save.status, await save.text());

    const status = await fetch('http://localhost:3000/api/admin/jsonbin', { method: 'GET', headers: { 'Authorization': 'Bearer ' + lj.token } });
    console.log('STATUS', status.status, await status.text());

    const push = await fetch('http://localhost:3000/api/admin/jsonbin/push', { method: 'POST', headers: { 'Authorization': 'Bearer ' + lj.token } });
    console.log('PUSH', push.status, await push.text());
  } catch(e){ console.error('ERR', e.message); }
})();
