import{createRequire as ae}from"node:module";import{existsSync as ce,unlinkSync as P,renameSync as ue}from"node:fs";import{tmpdir as de}from"node:os";import{join as le}from"node:path";var A=class{#e;constructor(e){this.#e=e}pragma(e){let r=this.#e.prepare(`PRAGMA ${e}`).all();if(!r||r.length===0)return;if(r.length>1)return r;let s=Object.values(r[0]);return s.length===1?s[0]:r[0]}exec(e){let t="",r=null,s=!1,i=!1,a=!1,d=()=>{let u=t.trim();a&&u&&this.#e.prepare(u).run(),t="",a=!1};for(let u=0;u<e.length;u++){let c=e[u],l=e[u+1];s?(t+=c,(c===`
`||c==="\r")&&(s=!1)):i?(t+=c,c==="*"&&l==="/"&&(t+=l,u++,i=!1)):r?(t+=c,c===r&&(r=null)):c==="'"||c==='"'?(t+=c,r=c,a=!0):c==="-"&&l==="-"?(t+=c+l,u++,s=!0):c==="/"&&l==="*"?(t+=c+l,u++,i=!0):c===";"?d():(t+=c,c.charCodeAt(0)>32&&(a=!0))}return d(),this}prepare(e){let t=this.#e.prepare(e);return{run:(...r)=>t.run(...r),get:(...r)=>{let s=t.get(...r);return s===null?void 0:s},all:(...r)=>t.all(...r),iterate:(...r)=>t.iterate(...r)}}transaction(e){return this.#e.transaction(e)}close(){this.#e.close()}},w=class{#e;constructor(e){this.#e=e}pragma(e){let r=this.#e.prepare(`PRAGMA ${e}`).all();if(!r||r.length===0)return;if(r.length>1)return r;let s=Object.values(r[0]);return s.length===1?s[0]:r[0]}exec(e){return this.#e.exec(e),this}prepare(e){let t=this.#e.prepare(e);return{run:(...r)=>t.run(...r),get:(...r)=>t.get(...r),all:(...r)=>t.all(...r),iterate:(...r)=>typeof t.iterate=="function"?t.iterate(...r):t.all(...r)[Symbol.iterator]()}}transaction(e){return(...t)=>{this.#e.exec("BEGIN");try{let r=e(...t);return this.#e.exec("COMMIT"),r}catch(r){throw this.#e.exec("ROLLBACK"),r}}}close(){this.#e.close()}},_=null;function ge(n){let e=null;try{return e=new n(":memory:"),e.exec("CREATE VIRTUAL TABLE __fts5_probe USING fts5(x)"),!0}catch{return!1}finally{try{e?.close()}catch{}}}function Ee(n,e){let t=e!==void 0?e:globalThis.Bun;if(typeof t<"u"&&t!==null)return!0;let r=n??process.versions,[s,i]=(r.node??"0.0.0").split("."),a=Number(s),d=Number(i);return!Number.isFinite(a)||!Number.isFinite(d)?!1:a>22||a===22&&d>=5}function me(){if(!_){let n=ae(import.meta.url);if(globalThis.Bun){let e=n(["bun","sqlite"].join(":")).Database;_=function(r,s){let i=new e(r,{readonly:s?.readonly,create:!0}),a=new A(i);return s?.timeout&&a.pragma(`busy_timeout = ${s.timeout}`),a}}else if(Ee()){let e=null;try{({DatabaseSync:e}=n(["node","sqlite"].join(":")))}catch{e=null}e&&ge(e)?_=function(r,s){let i=new e(r,{readOnly:s?.readonly??!1}),a=new w(i);return s?.timeout&&a.pragma(`busy_timeout = ${s.timeout}`),a}:_=n("better-sqlite3")}else _=n("better-sqlite3")}return _}function F(n){n.pragma("journal_mode = WAL"),n.pragma("synchronous = NORMAL");try{n.pragma("mmap_size = 268435456")}catch{}}function k(n){if(!ce(n))for(let e of["-wal","-shm"])try{P(n+e)}catch{}}function _e(n){for(let e of["","-wal","-shm"])try{P(n+e)}catch{}}function x(n){try{n.pragma("wal_checkpoint(TRUNCATE)")}catch{}try{n.close()}catch{}}function B(n="context-mode"){return le(de(),`${n}-${process.pid}.db`)}var pe=new Int32Array(new SharedArrayBuffer(4));function ye(n){n>0&&Atomics.wait(pe,0,0,n)}function fe(n,e=[100,500,2e3]){let t;for(let r=0;r<=e.length;r++)try{return n()}catch(s){let i=s instanceof Error?s.message:String(s);if(!i.includes("SQLITE_BUSY")&&!i.includes("database is locked"))throw s;t=s instanceof Error?s:new Error(i),r<e.length&&ye(e[r])}throw new Error(`SQLITE_BUSY: database is locked after ${e.length} retries. Original error: ${t?.message}`)}function Se(n){return n.includes("SQLITE_CORRUPT")||n.includes("SQLITE_NOTADB")||n.includes("database disk image is malformed")||n.includes("file is not a database")}function he(n){let e=Date.now();for(let t of["","-wal","-shm"])try{ue(n+t,`${n}${t}.corrupt-${e}`)}catch{}}var S=Symbol.for("__context_mode_live_dbs_v3__"),O=(()=>{let n=globalThis;return n[S]||(n[S]=new Set,process.on("exit",()=>{for(let e of n[S])x(e);n[S].clear()})),n[S]})(),R=class{#e;#t;constructor(e){let t=me();this.#e=e,k(e);let r;try{r=new t(e,{timeout:3e4}),F(r)}catch(s){let i=s instanceof Error?s.message:String(s);if(Se(i)){he(e),k(e);try{r=new t(e,{timeout:3e4}),F(r)}catch(a){throw new Error(`Failed to create fresh DB after renaming corrupt file: ${a instanceof Error?a.message:String(a)}`)}}else throw s}this.#t=r,O.add(this.#t),this.initSchema(),this.prepareStatements()}get db(){return this.#t}get dbPath(){return this.#e}close(){O.delete(this.#t),x(this.#t)}withRetry(e){return fe(e)}cleanup(){O.delete(this.#t),x(this.#t),_e(this.#e)}};import{createHash as h}from"node:crypto";import{execFileSync as Te}from"node:child_process";import{accessSync as ve,constants as Re,existsSync as D,mkdirSync as be,realpathSync as Le,renameSync as I}from"node:fs";import{homedir as q}from"node:os";import{dirname as De,isAbsolute as G,join as E,resolve as y}from"node:path";var g="CONTEXT_MODE_DIR",Y="sessions",j="content",T=class extends Error{kind;path;overrideEnvVar;ignoredEnvVar;ignoredReason;constructor(e,t,r=g,s,i,a={}){super(i??we(e,t,a),{cause:s}),this.name="StorageDirectoryError",this.kind=e,this.path=t,this.overrideEnvVar=r,this.ignoredEnvVar=a.ignoredEnvVar,this.ignoredReason=a.ignoredReason}},L=new Map;function Ke(n){let e=n.env??process.env,t=n.legacySessionDirEnv,r=t?e[t]?.trim():void 0;return r&&t?(n.onLegacySessionDir?.(t,r),r):E(Ce(n.configDir,n.configDirEnv,e),"context-mode","sessions")}function Ce(n,e,t){let r=e?t[e]:void 0;return r&&r.trim()!==""?V(r.trim()):V(n,q())}function V(n,e){return n.startsWith("~")?y(q(),n.replace(/^~[/\\]?/,"")):G(n)?y(n):e?y(e,n):y(n)}function Ne(n,e,t){return new T(n,e,g,void 0,[`Invalid ${g} for context-mode ${n} directory: ${t}`,J()].join(`
`))}function K(n){let e=process.env[g];if(e===void 0)return{kind:"unset"};let t=e.trim();if(!t)return{kind:"ignored-empty",ignoredEnvVar:g,ignoredReason:"empty"};if(!G(t))throw Ne(n,t,`${g} must be an absolute path.`);return{kind:"override",root:y(t)}}function Oe(n){return n.kind==="ignored-empty"?{ignoredEnvVar:n.ignoredEnvVar,ignoredReason:n.ignoredReason}:{}}function z(n,e){let t=K(n);return t.kind!=="override"?null:{kind:n,path:E(t.root,e),envVar:g,source:"override"}}function Ae(n,e,t){return{kind:n,path:y(e()),envVar:null,source:"default",...t}}function Q(n){let e=K("session");return e.kind==="override"?{kind:"session",path:E(e.root,Y),envVar:g,source:"override"}:Ae("session",n,Oe(e))}function ze(n){let e=z("content",j);if(e)return e;let t=Q(n);return{kind:"content",path:E(De(t.path),j),envVar:t.envVar,source:t.source,ignoredEnvVar:t.ignoredEnvVar,ignoredReason:t.ignoredReason}}function Qe(n){let e=z("stats",Y);if(e)return e;let t=Q(n);return{kind:"stats",path:t.path,envVar:t.envVar,source:t.source,ignoredEnvVar:t.ignoredEnvVar,ignoredReason:t.ignoredReason}}function Je(n){return n.message}function Ze(n){return n.source==="override"&&n.envVar?`via ${n.envVar}`:n.ignoredEnvVar&&n.ignoredReason==="empty"?`default; ignored empty ${n.ignoredEnvVar}`:"default"}function et(){L.clear()}function tt(n){let e=[n.kind,n.path,n.source,n.envVar??"",n.ignoredEnvVar??"",n.ignoredReason??""].join("\0"),t=L.get(e);if(t instanceof T)throw t;if(t===n.path)return t;try{return be(n.path,{recursive:!0}),ve(n.path,Re.W_OK),L.set(e,n.path),n.path}catch(r){let s=new T(n.kind,Ie(r)??n.path,g,r,void 0,{ignoredEnvVar:n.ignoredEnvVar,ignoredReason:n.ignoredReason});throw L.set(e,s),s}}function we(n,e,t={}){return[`context-mode ${n} directory is not writable: ${e}`,xe(t),J()].filter(Boolean).join(`
`)}function xe(n){return n.ignoredEnvVar&&n.ignoredReason==="empty"?`Ignored empty ${n.ignoredEnvVar}; using adapter default.`:null}function J(){return`Set ${g} to a writable absolute path.`}function Ie(n){if(!n||typeof n!="object")return null;let e=n.path;return typeof e=="string"&&e.length>0?e:null}var p;function m(n){let e=n.replace(/\\/g,"/");return/^\/+$/.test(e)?"/":/^[A-Za-z]:\/+$/.test(e)?`${e.slice(0,2)}/`:e.replace(/\/+$/,"")}function H(n){let e=n;try{e=Le.native(n)}catch{}let t=m(e);return process.platform==="win32"||process.platform==="darwin"?t.toLowerCase():t}function Z(n,e){return Te("git",["-C",n,...e],{encoding:"utf-8",timeout:2e3,stdio:["ignore","pipe","ignore"]}).trim()}function Ue(n){let e=Z(n,["rev-parse","--show-toplevel"]);return e.length>0?m(e):null}function Me(n){let e=Z(n,["worktree","list","--porcelain"]).split(/\r?\n/).find(t=>t.startsWith("worktree "))?.replace("worktree ","")?.trim();return e?m(e):null}function Fe(n=process.cwd()){let e=process.env.CONTEXT_MODE_SESSION_SUFFIX;if(p&&p.projectDir===n&&p.envSuffix===e)return p.suffix;let t="";if(e!==void 0)t=e?`__${e}`:"";else try{let r=Ue(n),s=Me(n);if(r&&s){let i=H(r),a=H(s);i!==a&&(t=`__${h("sha256").update(i).digest("hex").slice(0,8)}`)}}catch{}return p={projectDir:n,envSuffix:e,suffix:t},t}function nt(){p=void 0}function ee(n){return h("sha256").update(m(n)).digest("hex").slice(0,16)}function te(n){let e=m(n),t=process.platform==="darwin"||process.platform==="win32"?e.toLowerCase():e;return h("sha256").update(t).digest("hex").slice(0,16)}function rt(n){let{projectDir:e,contentDir:t}=n,r=te(e),s=E(t,`${r}.db`);if(D(s))return s;let i=ee(e);if(i===r)return s;let a=E(t,`${i}.db`);if(D(a))try{I(a,s);for(let d of["-wal","-shm"])try{I(a+d,s+d)}catch{}}catch{}return s}function st(n){return ke({...n,ext:".db"})}function ke(n){let{projectDir:e,sessionsDir:t,ext:r}=n,s=n.suffix??Fe(e),i=te(e),a=E(t,`${i}${s}${r}`);if(D(a))return a;let d=ee(e);if(d===i)return a;let u=E(t,`${d}${s}${r}`);if(D(u))try{I(u,a)}catch{}return a}var W=1e3,X=5;function b(n){let e=Number(n);return!Number.isFinite(e)||e<=0?0:Math.floor(e)}var o={insertEvent:"insertEvent",getEvents:"getEvents",getEventsByType:"getEventsByType",getEventsByPriority:"getEventsByPriority",getEventsByTypeAndPriority:"getEventsByTypeAndPriority",getEventCount:"getEventCount",getLatestAttributedProject:"getLatestAttributedProject",checkDuplicate:"checkDuplicate",evictLowestPriority:"evictLowestPriority",updateMetaLastEvent:"updateMetaLastEvent",ensureSession:"ensureSession",getSessionStats:"getSessionStats",getSessionRollup:"getSessionRollup",getMaxFileEdits:"getMaxFileEdits",getLatestCommitMessage:"getLatestCommitMessage",incrementCompactCount:"incrementCompactCount",getUsageCursor:"getUsageCursor",setUsageCursor:"setUsageCursor",upsertResume:"upsertResume",getResume:"getResume",markResumeConsumed:"markResumeConsumed",claimLatestUnconsumedResume:"claimLatestUnconsumedResume",deleteEvents:"deleteEvents",deleteMeta:"deleteMeta",deleteResume:"deleteResume",getOldSessions:"getOldSessions",searchEvents:"searchEvents",incrementToolCall:"incrementToolCall",getToolCallTotals:"getToolCallTotals",getToolCallByTool:"getToolCallByTool",getEventBytesSummary:"getEventBytesSummary"},ne=[["project_dir","TEXT NOT NULL DEFAULT ''"],["attribution_source","TEXT NOT NULL DEFAULT 'unknown'"],["attribution_confidence","REAL NOT NULL DEFAULT 0"],["bytes_avoided","INTEGER NOT NULL DEFAULT 0"],["bytes_returned","INTEGER NOT NULL DEFAULT 0"]];function re(n){let e=n.pragma("table_xinfo(session_events)"),t=new Set(e.map(s=>s.name)),r=!1;for(let[s,i]of ne)t.has(s)||(n.exec(`ALTER TABLE session_events ADD COLUMN ${s} ${i}`),r=!0);return r&&n.exec("CREATE INDEX IF NOT EXISTS idx_session_events_project ON session_events(session_id, project_dir)"),r}function ot(n,e){let t=null;try{t=new e(n,{readonly:!0});let r=new Set(t.pragma("table_xinfo(session_events)").map(s=>s.name));if(ne.every(([s])=>r.has(s)))return;t.close(),t=null,t=new e(n),re(t)}catch{}finally{try{t?.close()}catch{}}}var $=class extends R{constructor(e){super(e?.dbPath??B("session"))}stmt(e){return this.stmts.get(e)}initSchema(){try{let t=this.db.pragma("table_xinfo(session_events)").find(r=>r.name==="data_hash");t&&t.hidden!==0&&this.db.exec("DROP TABLE session_events")}catch{}this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 2,
        data TEXT NOT NULL,
        project_dir TEXT NOT NULL DEFAULT '',
        attribution_source TEXT NOT NULL DEFAULT 'unknown',
        attribution_confidence REAL NOT NULL DEFAULT 0,
        bytes_avoided INTEGER NOT NULL DEFAULT 0,
        bytes_returned INTEGER NOT NULL DEFAULT 0,
        source_hook TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        data_hash TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(session_id, type);
      CREATE INDEX IF NOT EXISTS idx_session_events_priority ON session_events(session_id, priority);

      CREATE TABLE IF NOT EXISTS session_meta (
        session_id TEXT PRIMARY KEY,
        project_dir TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_event_at TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        compact_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS session_resume (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        snapshot TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        consumed INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        session_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        bytes_returned INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, tool)
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
    `);try{re(this.db)}catch{}try{this.db.pragma("table_xinfo(session_meta)").some(t=>t.name==="usage_cursor")||this.db.exec("ALTER TABLE session_meta ADD COLUMN usage_cursor TEXT")}catch{}}prepareStatements(){this.stmts=new Map;let e=(t,r)=>{this.stmts.set(t,this.db.prepare(r))};e(o.insertEvent,`INSERT INTO session_events (
         session_id, type, category, priority, data,
         project_dir, attribution_source, attribution_confidence,
         bytes_avoided, bytes_returned,
         source_hook, data_hash
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),e(o.getEvents,`SELECT id, session_id, type, category, priority, data,
              project_dir, attribution_source, attribution_confidence,
              bytes_avoided, bytes_returned,
              source_hook, created_at, data_hash
       FROM session_events WHERE session_id = ? ORDER BY id ASC LIMIT ?`),e(o.getEventsByType,`SELECT id, session_id, type, category, priority, data,
              project_dir, attribution_source, attribution_confidence,
              bytes_avoided, bytes_returned,
              source_hook, created_at, data_hash
       FROM session_events WHERE session_id = ? AND type = ? ORDER BY id ASC LIMIT ?`),e(o.getEventsByPriority,`SELECT id, session_id, type, category, priority, data,
              project_dir, attribution_source, attribution_confidence,
              bytes_avoided, bytes_returned,
              source_hook, created_at, data_hash
       FROM session_events WHERE session_id = ? AND priority <= ? ORDER BY id ASC LIMIT ?`),e(o.getEventsByTypeAndPriority,`SELECT id, session_id, type, category, priority, data,
              project_dir, attribution_source, attribution_confidence,
              bytes_avoided, bytes_returned,
              source_hook, created_at, data_hash
       FROM session_events WHERE session_id = ? AND type = ? AND priority <= ? ORDER BY id ASC LIMIT ?`),e(o.getEventCount,"SELECT COUNT(*) AS cnt FROM session_events WHERE session_id = ?"),e(o.getLatestAttributedProject,`SELECT project_dir
       FROM session_events
       WHERE session_id = ? AND project_dir != ''
       ORDER BY id DESC
       LIMIT 1`),e(o.checkDuplicate,`SELECT 1 FROM (
         SELECT type, data_hash FROM session_events
         WHERE session_id = ? ORDER BY id DESC LIMIT ?
       ) AS recent
       WHERE recent.type = ? AND recent.data_hash = ?
       LIMIT 1`),e(o.evictLowestPriority,`DELETE FROM session_events WHERE id = (
         SELECT id FROM session_events WHERE session_id = ?
         ORDER BY priority DESC, id ASC LIMIT 1
       )`),e(o.updateMetaLastEvent,`UPDATE session_meta
       SET last_event_at = datetime('now'), event_count = event_count + 1
       WHERE session_id = ?`),e(o.ensureSession,"INSERT OR IGNORE INTO session_meta (session_id, project_dir) VALUES (?, ?)"),e(o.getSessionStats,`SELECT session_id, project_dir, started_at, last_event_at, event_count, compact_count
       FROM session_meta WHERE session_id = ?`),e(o.getSessionRollup,`SELECT
         COUNT(*) AS tool_calls,
         COALESCE(SUM(CASE WHEN category = 'error' THEN 1 ELSE 0 END), 0) AS errors,
         COUNT(DISTINCT type) AS unique_tools,
         COUNT(DISTINCT CASE WHEN category = 'file' THEN data END) AS unique_files,
         CASE WHEN SUM(CASE WHEN type = 'git_commit' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS has_commit,
         CAST(COALESCE((MAX(strftime('%s', created_at)) - MIN(strftime('%s', created_at))) / 60.0, 0) AS INTEGER) AS duration_min,
         COALESCE(SUM(CASE WHEN type = 'external_ref' THEN 1 ELSE 0 END), 0) AS sources_indexed,
         CAST(COALESCE(SUM(bytes_avoided) / 1024.0, 0) AS INTEGER) AS total_chunks,
         COALESCE(SUM(CASE WHEN type IN ('file_search', 'file_glob') THEN 1 ELSE 0 END), 0) AS search_queries
       FROM session_events
       WHERE session_id = ?`),e(o.getMaxFileEdits,`SELECT COALESCE(MAX(c), 0) AS max_file_edits
       FROM (
         SELECT COUNT(*) AS c
         FROM session_events
         WHERE session_id = ? AND category = 'file' AND type IN ('file_edit', 'file_write')
         GROUP BY data
       )`),e(o.getLatestCommitMessage,`SELECT data
       FROM session_events
       WHERE session_id = ? AND type = 'git_commit'
       ORDER BY id DESC
       LIMIT 1`),e(o.incrementCompactCount,"UPDATE session_meta SET compact_count = compact_count + 1 WHERE session_id = ?"),e(o.getUsageCursor,"SELECT usage_cursor FROM session_meta WHERE session_id = ?"),e(o.setUsageCursor,"UPDATE session_meta SET usage_cursor = ? WHERE session_id = ?"),e(o.upsertResume,`INSERT INTO session_resume (session_id, snapshot, event_count)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         snapshot = excluded.snapshot,
         event_count = excluded.event_count,
         created_at = datetime('now'),
         consumed = 0`),e(o.getResume,"SELECT snapshot, event_count, consumed FROM session_resume WHERE session_id = ?"),e(o.markResumeConsumed,"UPDATE session_resume SET consumed = 1 WHERE session_id = ?"),e(o.claimLatestUnconsumedResume,`UPDATE session_resume
       SET consumed = 1
       WHERE id = (
         SELECT id FROM session_resume
         WHERE consumed = 0
           AND session_id != ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       )
       RETURNING session_id, snapshot`),e(o.deleteEvents,"DELETE FROM session_events WHERE session_id = ?"),e(o.deleteMeta,"DELETE FROM session_meta WHERE session_id = ?"),e(o.deleteResume,"DELETE FROM session_resume WHERE session_id = ?"),e(o.searchEvents,`SELECT id, session_id, category, type, data, created_at
       FROM session_events
       WHERE (project_dir = ? OR project_dir = '')
         AND (data LIKE '%' || ? || '%' ESCAPE '\\' OR category LIKE '%' || ? || '%' ESCAPE '\\')
         AND (? IS NULL OR category = ?)
       ORDER BY id ASC
       LIMIT ?`),e(o.getOldSessions,"SELECT session_id FROM session_meta WHERE COALESCE(last_event_at, started_at) < datetime('now', ? || ' days')"),e(o.incrementToolCall,`INSERT INTO tool_calls (session_id, tool, calls, bytes_returned)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(session_id, tool) DO UPDATE SET
         calls = calls + 1,
         bytes_returned = bytes_returned + excluded.bytes_returned,
         updated_at = datetime('now')`),e(o.getToolCallTotals,`SELECT COALESCE(SUM(calls), 0) AS calls,
              COALESCE(SUM(bytes_returned), 0) AS bytes_returned
       FROM tool_calls WHERE session_id = ?`),e(o.getToolCallByTool,`SELECT tool, calls, bytes_returned
       FROM tool_calls WHERE session_id = ? ORDER BY calls DESC`),e(o.getEventBytesSummary,`SELECT COALESCE(SUM(bytes_avoided), 0) AS bytes_avoided,
              COALESCE(SUM(bytes_returned), 0) AS bytes_returned
       FROM session_events WHERE session_id = ?`)}insertEvent(e,t,r="PostToolUse",s,i){let a=h("sha256").update(t.data).digest("hex").slice(0,16).toUpperCase(),d=String(s?.projectDir??t.project_dir??this._getSessionProjectDir(e)).trim(),u=String(s?.source??t.attribution_source??"unknown"),c=Number(s?.confidence??t.attribution_confidence??0),l=Number.isFinite(c)?Math.max(0,Math.min(1,c)):0,f=b(i?.bytesAvoided),v=b(i?.bytesReturned),C=this.db.transaction(()=>{if(this.stmt(o.checkDuplicate).get(e,X,t.type,a))return;this.stmt(o.getEventCount).get(e).cnt>=W&&this.stmt(o.evictLowestPriority).run(e),this.stmt(o.insertEvent).run(e,t.type,t.category,t.priority,t.data,d,u,l,f,v,r,a),this.stmt(o.updateMetaLastEvent).run(e)});this.withRetry(()=>C())}bulkInsertEvents(e,t,r="PostToolUse",s,i){if(!t||t.length===0)return;if(t.length===1){this.insertEvent(e,t[0],r,s?.[0],i?.[0]);return}let a=t.map((u,c)=>{let l=h("sha256").update(u.data).digest("hex").slice(0,16).toUpperCase(),f=s?.[c],v=String(f?.projectDir??u.project_dir??this._getSessionProjectDir(e)??"").trim(),C=v===""?"":m(v),U=String(f?.source??u.attribution_source??"unknown"),N=Number(f?.confidence??u.attribution_confidence??0),se=Number.isFinite(N)?Math.max(0,Math.min(1,N)):0,M=i?.[c],oe=b(M?.bytesAvoided),ie=b(M?.bytesReturned);return{event:u,dataHash:l,projectDir:C,attributionSource:U,attributionConfidence:se,bytesAvoided:oe,bytesReturned:ie}}),d=this.db.transaction(()=>{let u=this.stmt(o.getEventCount).get(e).cnt;for(let c of a)this.stmt(o.checkDuplicate).get(e,X,c.event.type,c.dataHash)||(u>=W?this.stmt(o.evictLowestPriority).run(e):u++,this.stmt(o.insertEvent).run(e,c.event.type,c.event.category,c.event.priority,c.event.data,c.projectDir,c.attributionSource,c.attributionConfidence,c.bytesAvoided,c.bytesReturned,r,c.dataHash));this.stmt(o.updateMetaLastEvent).run(e)});this.withRetry(()=>d())}getEvents(e,t){let r=t?.limit??1e3,s=t?.type,i=t?.maxPriority;return s&&i!==void 0?this.stmt(o.getEventsByTypeAndPriority).all(e,s,i,r):s?this.stmt(o.getEventsByType).all(e,s,r):i!==void 0?this.stmt(o.getEventsByPriority).all(e,i,r):this.stmt(o.getEvents).all(e,r)}getEventCount(e){return this.stmt(o.getEventCount).get(e).cnt}getEventBytesSummary(e){let t=this.stmt(o.getEventBytesSummary).get(e);return{bytesAvoided:Number(t?.bytes_avoided??0),bytesReturned:Number(t?.bytes_returned??0)}}getLatestAttributedProjectDir(e){return this.stmt(o.getLatestAttributedProject).get(e)?.project_dir||null}_getSessionProjectDir(e){try{return this.db.prepare("SELECT project_dir FROM session_meta WHERE session_id = ?").get(e)?.project_dir||""}catch{return""}}searchEvents(e,t,r,s){try{let i=e.replace(/[%_]/g,d=>"\\"+d),a=s??null;return this.stmt(o.searchEvents).all(r,i,i,a,a,t)}catch{return[]}}getSessionIdsForProject(e){try{let t=m(e);return this.db.prepare(`SELECT DISTINCT session_id
             FROM session_events
            WHERE RTRIM(REPLACE(project_dir, '\\', '/'), '/') = ?`).all(t).map(s=>s.session_id)}catch{return[]}}ensureSession(e,t){this.stmt(o.ensureSession).run(e,t)}getSessionStats(e){return this.stmt(o.getSessionStats).get(e)??null}getSessionRollup(e){let t=this.stmt(o.getSessionRollup).get(e),r=this.stmt(o.getMaxFileEdits).get(e),s=this.stmt(o.getLatestCommitMessage).get(e),i=this.getSessionStats(e),a=(t?.tool_calls??0)>0?t?.unique_files??0:0,d=t?.errors??0,u=Math.min(a,d);return{tool_calls:t?.tool_calls??0,errors:t?.errors??0,unique_tools:t?.unique_tools??0,unique_files:t?.unique_files??0,max_file_edits:r?.max_file_edits??0,has_commit:t?.has_commit??0,commit_message:s?.data??"",edit_test_cycles:u,duration_min:t?.duration_min??0,compact_count:i?.compact_count??0,sources_indexed:t?.sources_indexed??0,total_chunks:t?.total_chunks??0,search_queries:t?.search_queries??0}}incrementCompactCount(e){this.stmt(o.incrementCompactCount).run(e)}getUsageCursor(e){return this.stmt(o.getUsageCursor).get(e)?.usage_cursor??null}setUsageCursor(e,t){this.stmt(o.setUsageCursor).run(t,e)}upsertResume(e,t,r){this.stmt(o.upsertResume).run(e,t,r??0)}getResume(e){return this.stmt(o.getResume).get(e)??null}markResumeConsumed(e){this.stmt(o.markResumeConsumed).run(e)}claimLatestUnconsumedResume(e){let t=this.stmt(o.claimLatestUnconsumedResume).get(e);return t?{sessionId:t.session_id,snapshot:t.snapshot}:null}getLatestSessionId(){try{return this.db.prepare("SELECT session_id FROM session_meta ORDER BY started_at DESC LIMIT 1").get()?.session_id??null}catch{return null}}incrementToolCall(e,t,r=0){let s=Number.isFinite(r)&&r>0?Math.round(r):0;try{this.stmt(o.incrementToolCall).run(e,t,s)}catch{}}getToolCallStats(e){try{let t=this.stmt(o.getToolCallTotals).get(e),r=this.stmt(o.getToolCallByTool).all(e),s={};for(let i of r)s[i.tool]={calls:i.calls,bytesReturned:i.bytes_returned};return{totalCalls:t?.calls??0,totalBytesReturned:t?.bytes_returned??0,byTool:s}}catch{return{totalCalls:0,totalBytesReturned:0,byTool:{}}}}deleteSession(e){this.db.transaction(()=>{this.stmt(o.deleteEvents).run(e),this.stmt(o.deleteResume).run(e),this.stmt(o.deleteMeta).run(e)})()}cleanupOldSessions(e=7){let t=`-${e}`,r=this.stmt(o.getOldSessions).all(t);for(let{session_id:s}of r)this.deleteSession(s);return r.length}pruneOrphanedEvents(){let e=this.db.prepare("DELETE FROM session_events WHERE session_id NOT IN (SELECT session_id FROM session_meta)").run();return Number(e.changes??0)}};export{$ as SessionDB,T as StorageDirectoryError,nt as _resetWorktreeSuffixCacheForTests,re as applyMissingSessionEventsColumns,et as clearStorageDirectoryCheckCacheForTests,Ze as describeStorageDirectorySource,ot as ensureSessionEventsSchema,tt as ensureWritableStorageDir,Je as formatStorageDirectoryError,Fe as getWorktreeSuffix,te as hashProjectDirCanonical,ee as hashProjectDirLegacy,m as normalizeWorktreePath,ze as resolveContentStorageDir,rt as resolveContentStorePath,Ke as resolveDefaultSessionDir,st as resolveSessionDbPath,ke as resolveSessionPath,Q as resolveSessionStorageDir,Qe as resolveStatsStorageDir};
