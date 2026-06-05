(async ()=>{
  try {
    const res = await fetch('http://localhost:3000/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin:'1234'})});
    const txt = await res.text();
    console.log('STATUS', res.status);
    console.log(txt);
  } catch(e) {
    console.error('ERR', e.message);
  }
})();
