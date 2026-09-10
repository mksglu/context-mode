import{createRequire as ie}from"node:module";import{existsSync as ae,unlinkSync as P,renameSync as ce}from"node:fs";import{tmpdir as ue}from"node:os";import{join as de}from"node:path";var A=class{#e;constructor(e){this.#e=e}pragma(e){let r=this.#e.prepare(`PRAGMA ${e}`).all();if(!r||r.length===0)return;if(r.length>1)return r;let s=Object.values(r[0]);return s.length===1?s[0]:r[0]}exec(e){let t="",r=null;for(let a=0;a<e.length;a++){let i=e[a];if(r)t+=i,i===r&&(r=null);else if(i==="'"||i==='"')t+=i,r=i;else if(i===";"){let c=t.trim();c&&this.#e.prepare(c).run(),t=""}else t+=i}let s=t.trim();return s&&this.#e.prepare(s).run(),this}prepare(e){let t=this.#e.prepare(e);return{run:(...r)=>t.run(...r),get:(...r)=>{let s=t.get(...r);return s===null?void 0:s},all:(...r)=>t.all(...r),iterate:(...r)=>t.iterate(...r)}}transaction(e){return this.#e.transaction(e)}close(){this.#e.close()}},w=class{#e;constructor(e){this.#e=e}pragma(e){let r=this.#e.prepare(`PRAGMA ${e}`).all();if(!r||r.length===0)return;if(r.length>1)return r;let s=Object.values(r[0]);return s.length===1?s[0]:r[0]}exec(e){return this.#e.exec(e),this}prepare(e){let t=this.#e.prepare(e);return{run:(...r)=>t.run(...r),get:(...r)=>t.get(...r),all:(...r)=>t.all(...r),iterate:(...r)=>typeof t.iterate=="function"?t.iterate(...r):t.all(...r)[Symbol.iterator]()}}transaction(e){return(...t)=>{this.#e.exec("BEGIN");try{let r=e(...t);return this.#e.exec("COMMIT"),r}catch(r){throw this.#e.exec("ROLLBACK"),r}}}close(){this.#e.close()}},m=null;function le(n){let e=null;try{return e=new n(":memory:"),e.exec("CREATE VIRTUAL TABLE __fts5_probe USING fts5(x)"),!0}catch{return!1}finally{try{e?.close()}catch{}}}function ge(n,e){let t=e!==void 0?e:globalThis.Bun;if(typeof t<"u"&&t!==null)return!0;let r=n??process.versions,[s,a]=(r.node??"0.0.0").split("."),i=Number(s),c=Number(a);return!Number.isFinite(i)||!Number.isFinite(c)?!1:i>22||i===22&&c>=5}function Ee(){if(!m){let n=ie(import.meta.url);if(globalThis.Bun){let e=n(["bun","sqlite"].join(":")).Database;m=function(r,s){let a=new e(r,{readonly:s?.readonly,create:!0}),i=new A(a);return s?.timeout&&i.pragma(`busy_timeout = ${s.timeout}`),i}}else if(ge()){let e=null;try{({DatabaseSync:e}=n(["node","sqlite"].join(":")))}catch{e=null}e&&le(e)?m=function(r,s){let a=new e(r,{readOnly:s?.readonly??!1}),i=new w(a);return s?.timeout&&i.pragma(`busy_timeout = ${s.timeout}`),i}:m=n("better-sqlite3")}else m=n("better-sqlite3")}return m}function F(n){n.pragma("journal_mode = WAL"),n.pragma("synchronous = NORMAL");try{n.pragma("mmap_size = 268435456")}catch{}}function k(n){if(!ae(n))for(let e of["-wal","-shm"])try{P(n+e)}catch{}}function me(n){for(let e of["","-wal","-shm"])try{P(n+e)}catch{}}function x(n){try{n.pragma("wal_checkpoint(TRUNCATE)")}catch{}try{n.close()}catch{}}function B(n="context-mode"){return de(ue(),`${n}-${process.pid}.db`)}function _e(n,e=[100,500,2e3]){let t;for(let r=0;r<=e.length;r++)try{return n()}catch(s){let a=s instanceof Error?s.message:String(s);if(!a.includes("SQLITE_BUSY")&&!a.includes("database is locked"))throw s;if(t=s instanceof Error?s:new Error(a),r<e.length){let i=e[r],c=Date.now();for(;Date.now()-c<i;);}}throw new Error(`SQLITE_BUSY: database is locked after ${e.length} retries. Original error: ${t?.message}`)}function pe(n){return n.includes("SQLITE_CORRUPT")||n.includes("SQLITE_NOTADB")||n.includes("database disk image is malformed")||n.includes("file is not a database")}function ye(n){let e=Date.now();for(let t of["","-wal","-shm"])try{ce(n+t,`${n}${t}.corrupt-${e}`)}catch{}}var S=Symbol.for("__context_mode_live_dbs_v3__"),O=(()=>{let n=globalThis;return n[S]||(n[S]=new Set,process.on("exit",()=>{for(let e of n[S])x(e);n[S].clear()})),n[S]})(),R=class{#e;#t;constructor(e){let t=Ee();this.#e=e,k(e);let r;try{r=new t(e,{timeout:3e4}),F(r)}catch(s){let a=s instanceof Error?s.message:String(s);if(pe(a)){ye(e),k(e);try{r=new t(e,{timeout:3e4}),F(r)}catch(i){throw new Error(`Failed to create fresh DB after renaming corrupt file: ${i instanceof Error?i.message:String(i)}`)}}else throw s}this.#t=r,O.add(this.#t),this.initSchema(),this.prepareStatements()}get db(){return this.#t}get dbPath(){return this.#e}close(){O.delete(this.#t),x(this.#t)}withRetry(e){return _e(e)}cleanup(){O.delete(this.#t),x(this.#t),me(this.#e)}};import{createHash as f}from"node:crypto";import{execFileSync as Se}from"node:child_process";import{accessSync as fe,constants as Te,existsSync as L,mkdirSync as he,realpathSync as ve,renameSync as I}from"node:fs";import{homedir as q}from"node:os";import{dirname as Re,isAbsolute as G,join as g,resolve as p}from"node:path";var l="CONTEXT_MODE_DIR",Y="sessions",j="content",T=class extends Error{kind;path;overrideEnvVar;ignoredEnvVar;ignoredReason;constructor(e,t,r=l,s,a,i={}){super(a??Ce(e,t,i),{cause:s}),this.name="StorageDirectoryError",this.kind=e,this.path=t,this.overrideEnvVar=r,this.ignoredEnvVar=i.ignoredEnvVar,this.ignoredReason=i.ignoredReason}},D=new Map;function Ge(n){let e=n.env??process.env,t=n.legacySessionDirEnv,r=t?e[t]?.trim():void 0;return r&&t?(n.onLegacySessionDir?.(t,r),r):g(be(n.configDir,n.configDirEnv,e),"context-mode","sessions")}function be(n,e,t){let r=e?t[e]:void 0;return r&&r.trim()!==""?V(r.trim()):V(n,q())}function V(n,e){return n.startsWith("~")?p(q(),n.replace(/^~[/\\]?/,"")):G(n)?p(n):e?p(e,n):p(n)}function De(n,e,t){return new T(n,e,l,void 0,[`Invalid ${l} for context-mode ${n} directory: ${t}`,J()].join(`
`))}function K(n){let e=process.env[l];if(e===void 0)return{kind:"unset"};let t=e.trim();if(!t)return{kind:"ignored-empty",ignoredEnvVar:l,ignoredReason:"empty"};if(!G(t))throw De(n,t,`${l} must be an absolute path.`);return{kind:"override",root:p(t)}}function Le(n){return n.kind==="ignored-empty"?{ignoredEnvVar:n.ignoredEnvVar,ignoredReason:n.ignoredReason}:{}}function z(n,e){let t=K(n);return t.kind!=="override"?null:{kind:n,path:g(t.root,e),envVar:l,source:"override"}}function Ne(n,e,t){return{kind:n,path:p(e()),envVar:null,source:"default",...t}}function Q(n){let e=K("session");return e.kind==="override"?{kind:"session",path:g(e.root,Y),envVar:l,source:"override"}:Ne("session",n,Le(e))}function Ye(n){let e=z("content",j);if(e)return e;let t=Q(n);return{kind:"content",path:g(Re(t.path),j),envVar:t.envVar,source:t.source,ignoredEnvVar:t.ignoredEnvVar,ignoredReason:t.ignoredReason}}function Ke(n){let e=z("stats",Y);if(e)return e;let t=Q(n);return{kind:"stats",path:t.path,envVar:t.envVar,source:t.source,ignoredEnvVar:t.ignoredEnvVar,ignoredReason:t.ignoredReason}}function ze(n){return n.message}function Qe(n){return n.source==="override"&&n.envVar?`via ${n.envVar}`:n.ignoredEnvVar&&n.ignoredReason==="empty"?`default; ignored empty ${n.ignoredEnvVar}`:"default"}function Je(){D.clear()}function Ze(n){let e=[n.kind,n.path,n.source,n.envVar??"",n.ignoredEnvVar??"",n.ignoredReason??""].join("\0"),t=D.get(e);if(t instanceof T)throw t;if(t===n.path)return t;try{return he(n.path,{recursive:!0}),fe(n.path,Te.W_OK),D.set(e,n.path),n.path}catch(r){let s=new T(n.kind,Ae(r)??n.path,l,r,void 0,{ignoredEnvVar:n.ignoredEnvVar,ignoredReason:n.ignoredReason});throw D.set(e,s),s}}function Ce(n,e,t={}){return[`context-mode ${n} directory is not writable: ${e}`,Oe(t),J()].filter(Boolean).join(`
`)}function Oe(n){return n.ignoredEnvVar&&n.ignoredReason==="empty"?`Ignored empty ${n.ignoredEnvVar}; using adapter default.`:null}function J(){return`Set ${l} to a writable absolute path.`}function Ae(n){if(!n||typeof n!="object")return null;let e=n.path;return typeof e=="string"&&e.length>0?e:null}var _;function E(n){let e=n.replace(/\\/g,"/");return/^\/+$/.test(e)?"/":/^[A-Za-z]:\/+$/.test(e)?`${e.slice(0,2)}/`:e.replace(/\/+$/,"")}function H(n){let e=n;try{e=ve.native(n)}catch{}let t=E(e);return process.platform==="win32"||process.platform==="darwin"?t.toLowerCase():t}function Z(n,e){return Se("git",["-C",n,...e],{encoding:"utf-8",timeout:2e3,stdio:["ignore","pipe","ignore"]}).trim()}function we(n){let e=Z(n,["rev-parse","--show-toplevel"]);return e.length>0?E(e):null}function xe(n){let e=Z(n,["worktree","list","--porcelain"]).split(/\r?\n/).find(t=>t.startsWith("worktree "))?.replace("worktree ","")?.trim();return e?E(e):null}function Ie(n=process.cwd()){let e=process.env.CONTEXT_MODE_SESSION_SUFFIX;if(_&&_.projectDir===n&&_.envSuffix===e)return _.suffix;let t="";if(e!==void 0)t=e?`__${e}`:"";else try{let r=we(n),s=xe(n);if(r&&s){let a=H(r),i=H(s);a!==i&&(t=`__${f("sha256").update(a).digest("hex").slice(0,8)}`)}}catch{}return _={projectDir:n,envSuffix:e,suffix:t},t}function et(){_=void 0}function ee(n){return f("sha256").update(E(n)).digest("hex").slice(0,16)}function te(n){let e=E(n),t=process.platform==="darwin"||process.platform==="win32"?e.toLowerCase():e;return f("sha256").update(t).digest("hex").slice(0,16)}function tt(n){let{projectDir:e,contentDir:t}=n,r=te(e),s=g(t,`${r}.db`);if(L(s))return s;let a=ee(e);if(a===r)return s;let i=g(t,`${a}.db`);if(L(i))try{I(i,s);for(let c of["-wal","-shm"])try{I(i+c,s+c)}catch{}}catch{}return s}function nt(n){return Ue({...n,ext:".db"})}function Ue(n){let{projectDir:e,sessionsDir:t,ext:r}=n,s=n.suffix??Ie(e),a=te(e),i=g(t,`${a}${s}${r}`);if(L(i))return i;let c=ee(e);if(c===a)return i;let d=g(t,`${c}${s}${r}`);if(L(d))try{I(d,i)}catch{}return i}var W=1e3,X=5;function b(n){let e=Number(n);return!Number.isFinite(e)||e<=0?0:Math.floor(e)}var o={insertEvent:"insertEvent",getEvents:"getEvents",getEventsByType:"getEventsByType",getEventsByPriority:"getEventsByPriority",getEventsByTypeAndPriority:"getEventsByTypeAndPriority",getEventCount:"getEventCount",getLatestAttributedProject:"getLatestAttributedProject",checkDuplicate:"checkDuplicate",evictLowestPriority:"evictLowestPriority",updateMetaLastEvent:"updateMetaLastEvent",ensureSession:"ensureSession",getSessionStats:"getSessionStats",getSessionRollup:"getSessionRollup",getMaxFileEdits:"getMaxFileEdits",getLatestCommitMessage:"getLatestCommitMessage",incrementCompactCount:"incrementCompactCount",getUsageCursor:"getUsageCursor",setUsageCursor:"setUsageCursor",upsertResume:"upsertResume",getResume:"getResume",markResumeConsumed:"markResumeConsumed",claimLatestUnconsumedResume:"claimLatestUnconsumedResume",deleteEvents:"deleteEvents",deleteMeta:"deleteMeta",deleteResume:"deleteResume",getOldSessions:"getOldSessions",searchEvents:"searchEvents",incrementToolCall:"incrementToolCall",getToolCallTotals:"getToolCallTotals",getToolCallByTool:"getToolCallByTool",getEventBytesSummary:"getEventBytesSummary"},Me=[["project_dir","TEXT NOT NULL DEFAULT ''"],["attribution_source","TEXT NOT NULL DEFAULT 'unknown'"],["attribution_confidence","REAL NOT NULL DEFAULT 0"],["bytes_avoided","INTEGER NOT NULL DEFAULT 0"],["bytes_returned","INTEGER NOT NULL DEFAULT 0"]];function ne(n){let e=n.pragma("table_xinfo(session_events)"),t=new Set(e.map(s=>s.name)),r=!1;for(let[s,a]of Me)t.has(s)||(n.exec(`ALTER TABLE session_events ADD COLUMN ${s} ${a}`),r=!0);return r&&n.exec("CREATE INDEX IF NOT EXISTS idx_session_events_project ON session_events(session_id, project_dir)"),r}function rt(n,e){let t=null;try{t=new e(n),ne(t)}catch{}finally{try{t?.close()}catch{}}}var $=class extends R{constructor(e){super(e?.dbPath??B("session"))}stmt(e){return this.stmts.get(e)}initSchema(){try{let t=this.db.pragma("table_xinfo(session_events)").find(r=>r.name==="data_hash");t&&t.hidden!==0&&this.db.exec("DROP TABLE session_events")}catch{}this.db.exec(`
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
    `);try{ne(this.db)}catch{}try{this.db.pragma("table_xinfo(session_meta)").some(t=>t.name==="usage_cursor")||this.db.exec("ALTER TABLE session_meta ADD COLUMN usage_cursor TEXT")}catch{}}prepareStatements(){this.stmts=new Map;let e=(t,r)=>{this.stmts.set(t,this.db.prepare(r))};e(o.insertEvent,`INSERT INTO session_events (
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
       FROM session_events WHERE session_id = ? AND priority >= ? ORDER BY id ASC LIMIT ?`),e(o.getEventsByTypeAndPriority,`SELECT id, session_id, type, category, priority, data,
              project_dir, attribution_source, attribution_confidence,
              bytes_avoided, bytes_returned,
              source_hook, created_at, data_hash
       FROM session_events WHERE session_id = ? AND type = ? AND priority >= ? ORDER BY id ASC LIMIT ?`),e(o.getEventCount,"SELECT COUNT(*) AS cnt FROM session_events WHERE session_id = ?"),e(o.getLatestAttributedProject,`SELECT project_dir
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
         ORDER BY priority ASC, id ASC LIMIT 1
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
       FROM session_events WHERE session_id = ?`)}insertEvent(e,t,r="PostToolUse",s,a){let i=f("sha256").update(t.data).digest("hex").slice(0,16).toUpperCase(),c=String(s?.projectDir??t.project_dir??this._getSessionProjectDir(e)).trim(),d=String(s?.source??t.attribution_source??"unknown"),u=Number(s?.confidence??t.attribution_confidence??0),h=Number.isFinite(u)?Math.max(0,Math.min(1,u)):0,y=b(a?.bytesAvoided),v=b(a?.bytesReturned),N=this.db.transaction(()=>{if(this.stmt(o.checkDuplicate).get(e,X,t.type,i))return;this.stmt(o.getEventCount).get(e).cnt>=W&&this.stmt(o.evictLowestPriority).run(e),this.stmt(o.insertEvent).run(e,t.type,t.category,t.priority,t.data,c,d,h,y,v,r,i),this.stmt(o.updateMetaLastEvent).run(e)});this.withRetry(()=>N())}bulkInsertEvents(e,t,r="PostToolUse",s,a){if(!t||t.length===0)return;if(t.length===1){this.insertEvent(e,t[0],r,s?.[0],a?.[0]);return}let i=t.map((d,u)=>{let h=f("sha256").update(d.data).digest("hex").slice(0,16).toUpperCase(),y=s?.[u],v=String(y?.projectDir??d.project_dir??this._getSessionProjectDir(e)??"").trim(),N=v===""?"":E(v),U=String(y?.source??d.attribution_source??"unknown"),C=Number(y?.confidence??d.attribution_confidence??0),re=Number.isFinite(C)?Math.max(0,Math.min(1,C)):0,M=a?.[u],se=b(M?.bytesAvoided),oe=b(M?.bytesReturned);return{event:d,dataHash:h,projectDir:N,attributionSource:U,attributionConfidence:re,bytesAvoided:se,bytesReturned:oe}}),c=this.db.transaction(()=>{let d=this.stmt(o.getEventCount).get(e).cnt;for(let u of i)this.stmt(o.checkDuplicate).get(e,X,u.event.type,u.dataHash)||(d>=W?this.stmt(o.evictLowestPriority).run(e):d++,this.stmt(o.insertEvent).run(e,u.event.type,u.event.category,u.event.priority,u.event.data,u.projectDir,u.attributionSource,u.attributionConfidence,u.bytesAvoided,u.bytesReturned,r,u.dataHash));this.stmt(o.updateMetaLastEvent).run(e)});this.withRetry(()=>c())}getEvents(e,t){let r=t?.limit??1e3,s=t?.type,a=t?.minPriority;return s&&a!==void 0?this.stmt(o.getEventsByTypeAndPriority).all(e,s,a,r):s?this.stmt(o.getEventsByType).all(e,s,r):a!==void 0?this.stmt(o.getEventsByPriority).all(e,a,r):this.stmt(o.getEvents).all(e,r)}getEventCount(e){return this.stmt(o.getEventCount).get(e).cnt}getEventBytesSummary(e){let t=this.stmt(o.getEventBytesSummary).get(e);return{bytesAvoided:Number(t?.bytes_avoided??0),bytesReturned:Number(t?.bytes_returned??0)}}getLatestAttributedProjectDir(e){return this.stmt(o.getLatestAttributedProject).get(e)?.project_dir||null}_getSessionProjectDir(e){try{return this.db.prepare("SELECT project_dir FROM session_meta WHERE session_id = ?").get(e)?.project_dir||""}catch{return""}}searchEvents(e,t,r,s){try{let a=e.replace(/[%_]/g,c=>"\\"+c),i=s??null;return this.stmt(o.searchEvents).all(r,a,a,i,i,t)}catch{return[]}}getSessionIdsForProject(e){try{let t=E(e);return this.db.prepare(`SELECT DISTINCT session_id
             FROM session_events
            WHERE RTRIM(REPLACE(project_dir, '\\', '/'), '/') = ?`).all(t).map(s=>s.session_id)}catch{return[]}}ensureSession(e,t){this.stmt(o.ensureSession).run(e,t)}getSessionStats(e){return this.stmt(o.getSessionStats).get(e)??null}getSessionRollup(e){let t=this.stmt(o.getSessionRollup).get(e),r=this.stmt(o.getMaxFileEdits).get(e),s=this.stmt(o.getLatestCommitMessage).get(e),a=this.getSessionStats(e),i=(t?.tool_calls??0)>0?t?.unique_files??0:0,c=t?.errors??0,d=Math.min(i,c);return{tool_calls:t?.tool_calls??0,errors:t?.errors??0,unique_tools:t?.unique_tools??0,unique_files:t?.unique_files??0,max_file_edits:r?.max_file_edits??0,has_commit:t?.has_commit??0,commit_message:s?.data??"",edit_test_cycles:d,duration_min:t?.duration_min??0,compact_count:a?.compact_count??0,sources_indexed:t?.sources_indexed??0,total_chunks:t?.total_chunks??0,search_queries:t?.search_queries??0}}incrementCompactCount(e){this.stmt(o.incrementCompactCount).run(e)}getUsageCursor(e){return this.stmt(o.getUsageCursor).get(e)?.usage_cursor??null}setUsageCursor(e,t){this.stmt(o.setUsageCursor).run(t,e)}upsertResume(e,t,r){this.stmt(o.upsertResume).run(e,t,r??0)}getResume(e){return this.stmt(o.getResume).get(e)??null}markResumeConsumed(e){this.stmt(o.markResumeConsumed).run(e)}claimLatestUnconsumedResume(e){let t=this.stmt(o.claimLatestUnconsumedResume).get(e);return t?{sessionId:t.session_id,snapshot:t.snapshot}:null}getLatestSessionId(){try{return this.db.prepare("SELECT session_id FROM session_meta ORDER BY started_at DESC LIMIT 1").get()?.session_id??null}catch{return null}}incrementToolCall(e,t,r=0){let s=Number.isFinite(r)&&r>0?Math.round(r):0;try{this.stmt(o.incrementToolCall).run(e,t,s)}catch{}}getToolCallStats(e){try{let t=this.stmt(o.getToolCallTotals).get(e),r=this.stmt(o.getToolCallByTool).all(e),s={};for(let a of r)s[a.tool]={calls:a.calls,bytesReturned:a.bytes_returned};return{totalCalls:t?.calls??0,totalBytesReturned:t?.bytes_returned??0,byTool:s}}catch{return{totalCalls:0,totalBytesReturned:0,byTool:{}}}}deleteSession(e){this.db.transaction(()=>{this.stmt(o.deleteEvents).run(e),this.stmt(o.deleteResume).run(e),this.stmt(o.deleteMeta).run(e)})()}cleanupOldSessions(e=7){let t=`-${e}`,r=this.stmt(o.getOldSessions).all(t);for(let{session_id:s}of r)this.deleteSession(s);return r.length}pruneOrphanedEvents(){let e=this.db.prepare("DELETE FROM session_events WHERE session_id NOT IN (SELECT session_id FROM session_meta)").run();return Number(e.changes??0)}};export{$ as SessionDB,T as StorageDirectoryError,et as _resetWorktreeSuffixCacheForTests,ne as applyMissingSessionEventsColumns,Je as clearStorageDirectoryCheckCacheForTests,Qe as describeStorageDirectorySource,rt as ensureSessionEventsSchema,Ze as ensureWritableStorageDir,ze as formatStorageDirectoryError,Ie as getWorktreeSuffix,te as hashProjectDirCanonical,ee as hashProjectDirLegacy,E as normalizeWorktreePath,Ye as resolveContentStorageDir,tt as resolveContentStorePath,Ge as resolveDefaultSessionDir,nt as resolveSessionDbPath,Ue as resolveSessionPath,Q as resolveSessionStorageDir,Ke as resolveStatsStorageDir};
