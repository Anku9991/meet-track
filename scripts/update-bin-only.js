(async ()=>{
  try {
    const binId = '6a2300e8ad83e65dfd06e7cb';
    const login = await fetch('http://localhost:3000/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin:'1234'})});
    const lj = await login.json();
    console.log('LOGIN', login.status, lj);
    if (!lj.token) throw new Error('No token');
    const hdr = { 'Authorization': 'Bearer ' + lj.token, 'Content-Type':'application/json' };

    const save = await fetch('http://localhost:3000/api/admin/jsonbin', { method: 'POST', headers: hdr, body: JSON.stringify({ bin: binId }) });
    console.log('SAVE', save.status, await save.text());

    const status = await fetch('http://localhost:3000/api/admin/jsonbin', { method: 'GET', headers: { 'Authorization': 'Bearer ' + lj.token } });
    console.log('STATUS', status.status, await status.text());
  } catch(e){ console.error('ERR', e.message); }
})();
