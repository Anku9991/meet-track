(async ()=>{
  try {
    const res = await fetch('http://localhost:3000/api/auth/init', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin:'1234', password:'adminpass'})});
    const txt = await res.text();
    console.log('STATUS', res.status);
    console.log(txt);
  } catch(e) {
    console.error('ERR', e.message);
  }
})();
