// app.js
const express = require('express');
const axios = require('axios');
const PropertiesReader = require('properties-reader');

const app = express();
const PORT = 9090;
const properties = PropertiesReader('app.properties');

const metaUrlTemplate = properties.get('events.meta.url');
const detailUrlTemplate = properties.get('events.detail.url');

app.use(express.static('public'));

function renderUrl(template, params) {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
  }
  return result;
}

app.get('/view/:id', async (req, res) => {
  const id = req.params.id;
  const env = req.query.env || 'dev';

  const metaUrl = renderUrl(metaUrlTemplate, {env: env, id: id})
  const detailUrl = renderUrl(detailUrlTemplate, {env: env})

  console.log(`Finding events for id ${id} in ${env}`)
  console.log(`${metaUrl} ${detailUrl}`)

  try {
    console.log('Requesting metas')
    const metaResponse = await axios.get(metaUrl, { params: { size: 150 } });
    const metas = metaResponse.data;
    console.log('metas size:', metas.length);

    const tuples = [];
    const requestMap = new Map();
    const responseMap = new Map();

    for (const meta of metas) {
      if (meta.requestId) {
          requestMap.set(meta.requestId, meta.id);
          responseMap.set(meta.id, meta.requestId);
      } else if (!requestMap.has(meta.id)) {
        requestMap.set(meta.id, null);
      }
    }

    for (const [reqId, resId] of requestMap.entries()) {
      tuples.push([reqId, resId]);
    }
    for (const [resId, reqId] of responseMap.entries()) {
      if (!tuples.find(([r]) => r === reqId)) {
        tuples.push([null, resId]);
      }
    }

    const BATCH_SIZE = 100;

    function chunkArray(arr, size) {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    }

    console.log('Requesting details');
    const eventIds = tuples.flat().filter(Boolean);
    console.log('eventIds size:', eventIds.length);
    //console.dir(eventIds, { maxArrayLength: null }); //DEBUG

    const batches = chunkArray(eventIds, BATCH_SIZE);

    const detailResponses = await Promise.all(
      batches.map(batch =>
        axios.post(detailUrl, {
          caseIds: [id],
          eventIds: batch
        })
      )
    );

    console.log('Sorting events and generating html')
    const details = detailResponses.flatMap(response => response.data);
    details.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

    const eventMap = {};
details.forEach(event => {
  eventMap[event.eventId] = event;
});
// Mapea eventId a metadata crudo
const metaMap = {};
metas.forEach(meta => {
  metaMap[meta.id] = meta;
});


    // HTML principal: solo CSS comprimido
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Visor de Eventos - ${id}</title>
  <style>body{font-family:'Inter',Arial,sans-serif;margin:0;background:#f8f8f8}
.tz-switch-row{max-width:680px;margin:30px auto 0 auto;display:flex;align-items:center;gap:18px;font-size:1.06rem}
.tz-switch-row .switch{position:relative;display:inline-block;width:50px;height:28px;vertical-align:middle}
.tz-switch-row .switch input{opacity:0;width:0;height:0}
.tz-switch-row .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:.3s;border-radius:34px}
.tz-switch-row .slider:before{position:absolute;content:\"\";height:22px;width:22px;left:4px;bottom:3px;background:white;transition:.3s;border-radius:50%}
.tz-switch-row .switch input:checked+.slider{background:#339cf4}
.tz-switch-row .switch input:checked+.slider:before{transform:translateX(22px)}
.tz-switch-row #tzSwitchLabel{font-weight:600;min-width:94px;display:inline-block}
.tz-switch-row #timezoneLabel{font-size:.97rem;color:#777;margin-left:10px;font-style:italic}
.modal-overlay{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.25);backdrop-filter:blur(2px);justify-content:center;align-items:center}
.modal-overlay.show{display:flex}
.modal-container{
  position:relative;
  background:#fff;
  border-radius:16px;
  width:96vw;
  max-width:980px;
  box-shadow:0 4px 32px 4px #0002;
  min-height:70vh;
  max-height:92vh;
  margin:32px auto 8px auto;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  overflow:visible;
}
.tab-bar{position:absolute;top:-36px;left:32px;display:flex;z-index:10;gap:0}
.tab-bar .tab-button{background:#f4f4f4;border:1px solid #ddd;border-bottom:none;border-radius:12px 12px 0 0;margin-right:1px;font-weight:600;padding:9px 28px 8px 28px;cursor:pointer;font-size:1rem;transition:background .2s,color .2s;position:relative;z-index:2}
.tab-bar .tab-button.active{background:#fff;color:#191919;border-color:#ccc;box-shadow:0 1px 2px #0002}
.modal-inner{padding:32px 32px 18px 32px;display:flex;flex-direction:column;position:relative;}
#entityContent .json-pretty { min-height: 360px; max-height: 63vh; overflow-x:auto; max-width:100%; box-sizing:border-box; white-space:pre; }
@media (max-width: 800px) {
  .modal-container { max-width: 99vw; min-height: 50vh; }
  #entityContent .json-pretty { min-height: 180px; max-height: 39vh; }
}
.close-btn{position:absolute;left:18px;top:18px;background:none;border:none;font-size:1.6rem;cursor:pointer;color:#666}
.modal-header{text-align:center;font-size:2rem;font-weight:bold;margin-bottom:6px}
.modal-date{position:absolute;right:34px;top:20px;font-size:.95rem;color:#888}
.status{font-size:1rem;margin:4px 0 12px 0;min-height:1.2em}
.status.success{color:#2e7d32}
.status.error{color:#c62828}
.status.warning { color: #d6a300; }
.section{margin:0 0 10px 0}
.section-title{display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-weight:600;font-size:1.05rem;margin:0;padding:6px 0 3px 0;user-select:none}
.section-content{display:none;background:#f4f7fa;border-radius:8px;padding:7px 7px 7px 17px;font-size:.97rem;word-break:break-word;margin:0;max-height:300px;overflow-y:auto}
.section-content.visible{display:block}
@media (max-width:600px){
  .modal-container{padding:0;max-width:98vw}
  .modal-inner{padding:19px 6vw 8vw 6vw}
  .tab-bar{left:8vw}
  .modal-header{font-size:1.1rem}
}
.event-list-main{list-style:none;margin:50px auto 0 auto;padding:0;max-width:680px;background:#fff;border-radius:11px;box-shadow:0 2px 14px #0002;overflow:hidden}
.event-list-row{display:flex;align-items:center;justify-content:space-between;padding:17px 28px;font-size:1.07rem;border-bottom:1px solid #f3f3f3;cursor:pointer;transition:background .15s}
.event-list-row:hover{background:#f6f8fc}
.event-list-row span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36vw}
.event-list-row .event-eye{font-size:1.32rem;opacity:.68;margin-left:1.4rem;transition:color .2s,opacity .16s}
.event-list-row .event-eye:hover{color:#176afe;opacity:1}

/* === JSON Pretty Print === */
.json-pretty { font-family: 'Fira Mono', 'Menlo', monospace; font-size: .72em; background: #23272e; color: #e3eaf0; border-radius: 7px; padding: 11px 13px 11px 13px; position: relative; overflow-x:auto; max-width:100%; box-sizing:border-box; white-space:pre; }
.json-key { color: #9cdcfe; }
.json-string { color: #ce9178; }
.json-number { color: #b5cea8; }
.json-boolean { color: #569cd6; }
.json-null { color: #d16969; }
.copy-btn { position: absolute; right: 8px; top: 8px; background: #222b; border: none; color: #eee; font-size: 0.95em; border-radius: 6px; padding: 3px 10px; cursor: pointer; opacity: 0; transition: opacity 0.16s; z-index: 2; }
.section-content:hover .copy-btn { opacity: 1; }
.copy-btn.copied { background: #2e7d32; color: #fff; }

</style>
</head>
<body>
  <h1 style="text-align:center; margin-top:24px;">Eventos del ID: ${id}</h1>
  <div class="tz-switch-row">
  <label class="switch">
    <input type="checkbox" id="tzSwitch" checked>
    <span class="slider"></span>
  </label>
  <span id="tzSwitchLabel">Hora Local</span>
  <span id="timezoneLabel"></span>
</div>
  <ul class="event-list-main" id="eventList">
  </ul>
  <div class="modal-overlay" id="modal">
    <div class="modal-container">
      <div class="tab-bar" id="tabHeader"></div>
      <div class="modal-inner">
  <button class="close-btn" id="closeModalBtn">&times;</button>
  <div class="modal-header">
    <span id="modalType"></span>
    <span class="modal-date" id="modalDate"></span>
  </div>
  <div id="modalStatus" class="status"></div>
  <div class="section">
    <div class="section-title" onclick="toggleSection('metadataContent')">Metadata <span>▼</span></div>
    <div class="section-content" id="metadataContent"></div>
  </div>
  <div class="section">
    <div class="section-title" onclick="toggleSection('headersContent')">Headers <span>▼</span></div>
    <div class="section-content" id="headersContent"></div>
  </div>
  <div class="section">
    <div class="section-title" onclick="toggleSection('entityContent')">Entity <span>▼</span></div>
    <div class="section-content visible" id="entityContent"></div>
  </div>
</div>
      </div>
    </div>
  </div>
  </div>
  <script type="application/json" id="event-data">
  ${JSON.stringify(eventMap).replace(/</g, '<').replace(/>/g, '>')}
</script>
<script type="application/json" id="meta-data">
  ${JSON.stringify(metaMap).replace(/</g, '<').replace(/>/g, '>')}
</script>
  <script>
window.addEventListener('DOMContentLoaded', function() {
    const eventMap = JSON.parse(document.getElementById('event-data').textContent);
    const metaMap = JSON.parse(document.getElementById('meta-data').textContent);
    const requestResponseTuples = ${JSON.stringify(tuples)};
    let lastSectionOpened = null;
    let currentTZ = 'local';
    let currentModalEventId = null;
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      if (currentTZ === 'utc') {
        return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      } else {
        const options = {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
          timeZoneName: 'short'
        };
        return date.toLocaleString(undefined, options);
      }
    }

    // Colorea JSON para HTML (tipo IDE)
function syntaxHighlight(json) {
  if (typeof json != "string") {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = "json-number";
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = "json-key";
      } else {
        cls = "json-string";
      }
    } else if (/true|false/.test(match)) {
      cls = "json-boolean";
    } else if (/null/.test(match)) {
      cls = "json-null";
    }
    return '<span class="' + cls + '">' + match + "</span>";
  });
}

// Copia JSON al portapapeles
function copyJSON(btn) {
  var id = btn.getAttribute('data-for');
  const el = document.getElementById(id);
  const text = el.dataset.rawjson || '';
  if (!text) {
    btn.innerText = 'Error';
    setTimeout(() => { btn.innerText = '📋 Copiar'; }, 1000);
    return;
  }
  // Intenta usar clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function() {
      btn.classList.add('copied');
      btn.innerText = 'Copiado!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerText = '📋 Copiar';
      }, 1200);
    }, function() {
      btn.innerText = 'Error';
      setTimeout(() => { btn.innerText = '📋 Copiar'; }, 1200);
    });
  } else {
    // Fallback legacy (menos seguro pero funciona local)
    let textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      let successful = document.execCommand('copy');
      if (successful) {
        btn.classList.add('copied');
        btn.innerText = 'Copiado!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerText = '📋 Copiar';
        }, 1200);
      } else {
        throw new Error();
      }
    } catch (err) {
      btn.innerText = 'Error';
      setTimeout(() => { btn.innerText = '📋 Copiar'; }, 1200);
    }
    document.body.removeChild(textarea);
  }
}
window.copyJSON = copyJSON;
    
    function renderEventList() {
      const eventArr = Object.values(eventMap)
        .sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
      document.getElementById('eventList').innerHTML = eventArr.map(event => {
        return '<li class="event-list-row" data-event-id="' + event.eventId + '"><span>' + formatDate(event.eventDate) + '</span><span>' + event.eventType + '</span><span class="event-eye">👁️</span></li>';
      }).join('');
      document.querySelectorAll('.event-list-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.dataset.eventId;
          showModal(id);
        });
      });
    }
    // --- SWITCH LOGIC ---
    var tzSwitch = document.getElementById('tzSwitch');
    var tzSwitchLabel = document.getElementById('tzSwitchLabel');
    tzSwitch.addEventListener('change', function() {
      currentTZ = tzSwitch.checked ? 'local' : 'utc';
      tzSwitchLabel.textContent = tzSwitch.checked ? 'Hora Local' : 'UTC (GMT-0)';
      renderEventList();
      document.getElementById('timezoneLabel').textContent = currentTZ === 'utc'
        ? '(Todas las fechas en UTC)'
        : '(Zona: ' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')';
      if (document.getElementById('modal').classList.contains('show') && currentModalEventId) {
        showModal(currentModalEventId, true);
      }
    });
    renderEventList();
    tzSwitchLabel.textContent = tzSwitch.checked ? 'Hora Local' : 'UTC (GMT-0)';
    document.getElementById('timezoneLabel').textContent = '(Zona: ' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')';
    window.showModal = function showModal(eventId, isRerender) {
      currentModalEventId = eventId;
      const modal = document.getElementById('modal');
      const tabHeader = document.getElementById('tabHeader');
      tabHeader.innerHTML = '';
      modal.classList.add('show');
      const pair = requestResponseTuples.find(function(tuple){ return tuple[0] === eventId || tuple[1] === eventId; }) || [];
      const isRequest = pair[0] === eventId;
      const otherId = isRequest ? pair[1] : pair[0];
      const request = isRequest ? eventMap[eventId] : eventMap[otherId];
      const response = isRequest ? eventMap[otherId] : eventMap[eventId];
      if (request) {
        const btn = document.createElement('button');
        btn.className = 'tab-button';
        btn.id = 'tabRequest';
        btn.textContent = 'Request';
        btn.onclick = function() {
          btn.classList.add('active');
          var respBtn = document.getElementById('tabResponse');
          if(respBtn) respBtn.classList.remove('active');
          render(request);
        };
        tabHeader.appendChild(btn);
      }
      if (response) {
        const btn = document.createElement('button');
        btn.className = 'tab-button';
        btn.id = 'tabResponse';
        btn.textContent = 'Response';
        btn.onclick = function() {
          btn.classList.add('active');
          var reqBtn = document.getElementById('tabRequest');
          if(reqBtn) reqBtn.classList.remove('active');
          render(response);
        };
        tabHeader.appendChild(btn);
      }
      if (!isRerender) {
        if (isRequest) {
          var reqBtn = document.getElementById('tabRequest');
          if(reqBtn) reqBtn.click();
        } else {
          var respBtn = document.getElementById('tabResponse');
          if(respBtn) respBtn.click();
        }
      } else {
        var activeTab = document.querySelector('.tab-bar .tab-button.active');
        if (activeTab) activeTab.click();
        else if (isRequest) {
          var reqBtn = document.getElementById('tabRequest');
          if(reqBtn) reqBtn.click();
        } else {
          var respBtn = document.getElementById('tabResponse');
          if(respBtn) respBtn.click();
        }
      }
    };
    function render(event) {
      document.getElementById('modalType').innerText = event.eventType;
      document.getElementById('modalDate').innerText = formatDate(event.eventDate);

      //STATUS
      const modalStatus = document.getElementById('modalStatus');
      if (typeof event.status === 'undefined' || event.status === 0) {
        modalStatus.innerText = '';
        modalStatus.className = 'status';
      } else {
        let statusClass = 'status ';
        if (event.status >= 100 && event.status < 200) {
          statusClass += 'warning';
        } else if (event.status >= 200 && event.status < 300) {
          statusClass += 'success';
        } else {
          statusClass += 'error';
        }
        // Status text
        let statusText = '';
        if (event.status >= 200 && event.status < 300) {
          statusText = 'Exitoso (' + event.status + ')';
        } else if (event.status >= 100 && event.status < 200) {
          statusText = 'Warning (' + event.status + ')';
        } else {
          statusText = 'Error (' + event.status + ')';
        }
        modalStatus.innerText = statusText;
        modalStatus.className = statusClass;
      }

      //URI 
        if (document.getElementById('uriRow')) {
          document.getElementById('uriRow').remove();
        }

        if (typeof event.uri === 'string' && event.uri.trim() !== '') {
          const modalInner = document.querySelector('.modal-inner');
          const statusDiv = document.getElementById('modalStatus');
          const uriDiv = document.createElement('div');
          uriDiv.id = 'uriRow';
          uriDiv.style.cssText = 'padding: 0 0 6px 0; font-size: .67em; font-family: Fira Mono, Menlo, monospace; color: #176afe; word-break:break-all; user-select: all;';
          uriDiv.textContent = event.uri;
          uriDiv.className = statusDiv.className;
          modalInner.insertBefore(uriDiv, statusDiv.nextElementSibling);
        }

      document.querySelectorAll('.section-content').forEach(function(s){s.classList.remove('visible')});
      // Metadata (nuevo, pretty)
var meta = metaMap[event.eventId];
var metadataContent = document.getElementById('metadataContent');
if (meta) {
  metadataContent.innerHTML =
  '<button class="copy-btn" data-for="metadataContent" onclick="copyJSON(this)" tabindex="0">📋 Copiar</button>' +
  '<pre class="json-pretty">' + syntaxHighlight(meta) + '</pre>';

  metadataContent.dataset.rawjson = JSON.stringify(meta, null, 2);
} else {
  metadataContent.innerHTML = 'No metadata';
  metadataContent.dataset.rawjson = '';
}
// Headers
document.getElementById('headersContent').innerHTML = Array.isArray(event.headers)
  ? '<ul>' + event.headers.map(function(h){return '<li>'+h+'</li>';}).join('') + '</ul>'
  : '<p>' + String(event.headers || '') + '</p>';
// Entity (pretty)
var entityContent = document.getElementById('entityContent');
try {
  var parsedEntity = typeof event.entity === 'string' ? JSON.parse(event.entity) : event.entity;
  entityContent.innerHTML =
  '<button class="copy-btn" data-for="entityContent" onclick="copyJSON(this)" tabindex="0">📋 Copiar</button>' +
  '<pre class="json-pretty">' + syntaxHighlight(parsedEntity) + '</pre>';
  entityContent.dataset.rawjson = JSON.stringify(parsedEntity, null, 2);
} catch (e) {
  entityContent.innerHTML = event.entity;
  entityContent.dataset.rawjson = event.entity;
}

      // Por defecto solo Entity expandido
      document.getElementById('entityContent').classList.add('visible');
      lastSectionOpened = 'entityContent';
    }
    function closeModal() {
      document.getElementById('modal').classList.remove('show');
      currentModalEventId = null;
    }
    window.toggleSection = function(id) {
      document.querySelectorAll('.section-content').forEach(function(s){s.classList.remove('visible')});
      document.getElementById(id).classList.add('visible');
      lastSectionOpened = id;
    };
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
});
</script>
</body>
</html>`;
    res.send(html);
  } catch (err) {
    console.log(`Error al obtener eventos ${err}`)
    res.status(500).send('Error al obtener los datos');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});


