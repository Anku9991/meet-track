(async ()=>{
  try {
    const login = await fetch('http://localhost:3000/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin:'1234'})});
    const lj = await login.json();
    console.log('LOGIN', login.status, lj);
    const token = lj.token;
    if (!token) return;
    const hdr = { 'Authorization': 'Bearer ' + token };

    const jstatus = await fetch('http://localhost:3000/api/admin/jsonbin', { method: 'GET', headers: hdr });
    console.log('JSONBIN STATUS', jstatus.status, await jstatus.text());

    const push = await fetch('http://localhost:3000/api/admin/jsonbin/push', { method: 'POST', headers: hdr });
    console.log('PUSH', push.status, await push.text());
  } catch(e) { console.error('ERR', e); }
})();
