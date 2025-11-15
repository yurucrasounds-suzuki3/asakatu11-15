(function(){
  const $ = (sel)=>document.querySelector(sel);
  const zipcodeInput = $('#zipcode');
  const form = $('#search-form');
  const message = $('#message');
  const btn = $('#search-btn');
  const pref = $('#pref');
  const city = $('#city');
  const town = $('#town');
  const full = $('#full');
  let map, marker;
  let geoTimer = null;


  function setMessage(text, type){
    message.textContent = text || '';
    message.className = 'message' + (type ? ' '+type : '');
  }
  function cleanZip(v){
    return (v||'').replace(/[^0-9]/g,'').slice(0,7);
  }
  function formatZip(z){
    const s = cleanZip(z);
    return s.length > 3 ? `${s.slice(0,3)}-${s.slice(3)}` : s;
  }
  function displayAddress(r){
    pref.value = r.address1 || '';
    city.value = r.address2 || '';
    town.value = r.address3 || '';
    full.value = [r.address1, r.address2, r.address3].filter(Boolean).join('');
    // デバウンスしてジオコーディング
    if(geoTimer) clearTimeout(geoTimer);
    geoTimer = setTimeout(()=>{
      const queries = buildAddressQueries({
        zip: cleanZip(zipcodeInput.value),
        pref: pref.value,
        city: city.value,
        town: town.value
      });
      geocodeWithFallbacks(queries);
    }, 250);
  }
  function clearAddress(){
    pref.value = city.value = town.value = full.value = '';
    clearMap();
  }
  async function search(zip){
    const z = cleanZip(zip);
    if(z.length !== 7){
      setMessage('郵便番号は7桁で入力してください。', 'err');
      return;
    }
    setMessage('検索中です…', '');
    btn.disabled = true;
    try{
      const url = `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(z)}`;
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('ネットワークエラー');
      const data = await res.json();
      if(data.status !== 200){
        clearAddress();
        setMessage(data.message || '該当する住所が見つかりません。', 'err');
        return;
      }
      const results = data.results || [];
      if(results.length === 0){
        clearAddress();
        setMessage('該当する住所が見つかりません。', 'err');
        return;
      }
      displayAddress(results[0]);
      setMessage('住所を取得しました。', 'ok');
    }catch(e){
      clearAddress();
      setMessage('エラーが発生しました。時間をおいて再度お試しください。', 'err');
      console.error(e);
    }finally{
      btn.disabled = false;
    }
  }

  // --- Map ---
  function initMap(){
    const el = document.getElementById('map');
    if(!el || typeof L === 'undefined') return;
    if(map) return; // already initialized
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([35.681236, 139.767125], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  }

  function clearMap(){
    if(marker && map){
      map.removeLayer(marker);
      marker = null;
    }
  }

  function buildAddressQueries({zip, pref, city, town}){
    const parts = [pref, city, town].filter(Boolean);
    const fullAddr = parts.join(' ');
    const jpFull = fullAddr ? `${fullAddr} 日本` : '';
    const jpPrefCity = [pref, city].filter(Boolean).join(' ');
    const q1 = jpFull;                // 例: 東京都 千代田区 千代田 日本
    const q2 = jpPrefCity || fullAddr;// 例: 東京都 千代田区
    const q3 = zip || fullAddr;       // 例: 1000001
    return [q1, q2, q3].filter(Boolean);
  }

  async function geocodeQuery(q){
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
    if(!res.ok) throw new Error('geocode network error');
    const arr = await res.json();
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  }

  async function geocodeWithFallbacks(queries){
    try{
      initMap();
      if(!map || !queries || queries.length === 0) return;
      let hit = null;
      for(const q of queries){
        hit = await geocodeQuery(q);
        if(hit) break;
      }
      if(!hit){
        // 住所は取得済みなのでメッセージは控えめに
        setMessage('地図の位置を特定できませんでした。番地などを追加して再検索してください。', 'err');
        clearMap();
        return;
      }
      const { lat, lon, display_name } = hit;
      const latNum = parseFloat(lat), lonNum = parseFloat(lon);
      if(Number.isFinite(latNum) && Number.isFinite(lonNum)){
        map.setView([latNum, lonNum], 16);
        clearMap();
        marker = L.marker([latNum, lonNum]).addTo(map);
        marker.bindPopup(display_name || queries[0], { closeButton: true });
      }
    }catch(e){
      console.error(e);
    }
  }

  // ハイフン整形プレビュー（入力表示用）
  function formatDisplay(v){
    const z = cleanZip(v);
    if(z.length > 3){
      return z.slice(0,3)+'-'+z.slice(3);
    }
    return z;
  }

  // 入力イベント: 表示フォーマットと自動検索
  zipcodeInput.addEventListener('input', (e)=>{
    const pos = zipcodeInput.selectionStart;
    const before = zipcodeInput.value;
    const raw = cleanZip(before);
    const formatted = formatDisplay(before);
    zipcodeInput.value = formatted;
    // caret best-effort
    const delta = formatted.length - before.length;
    zipcodeInput.setSelectionRange(Math.max(0,(pos||0)+delta), Math.max(0,(pos||0)+delta));

    setMessage('', '');
    if(raw.length === 7){
      search(raw);
    } else if(raw.length < 7){
      clearAddress();
    }
  });

  // Submit（Enter/ボタンクリック）
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const raw = cleanZip(zipcodeInput.value);
    search(raw);
  });

  // 初期化
  initMap();

  // Reverse lookup removed
})();
