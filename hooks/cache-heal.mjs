#!/usr/bin/env node
// context-mode plugin cache self-heal (auto-deployed)
// Fixes anthropics/claude-code#46915: auto-update breaks CLAUDE_PLUGIN_ROOT
// Issue #727: also normalizes stale version paths in existing installPaths
// Honors CLAUDE_CONFIG_DIR (#577) — checked at this script's runtime so users
// who set CLAUDE_CONFIG_DIR after install still get healed correctly.
// Pure Node.js — no bash/shell dependency.
import{existsSync,readdirSync,statSync,symlinkSync,lstatSync,unlinkSync,readFileSync}from"node:fs";
import{dirname,join,resolve,sep}from"node:path";
import{homedir}from"node:os";
function cfgDir(){const e=process.env.CLAUDE_CONFIG_DIR;if(e&&e.trim()!==""){return e.startsWith("~")?resolve(homedir(),e.replace(/^~[/\\]?/,"")):resolve(e)}return resolve(homedir(),".claude")}
try{
  const f=resolve(cfgDir(),"plugins","installed_plugins.json");
  if(!existsSync(f))process.exit(0);
  const cacheRoot=resolve(cfgDir(),"plugins","cache");
  const ip=JSON.parse(readFileSync(f,"utf-8"));
  for(const[k,es]of Object.entries(ip.plugins||{})){
    if(k!=="context-mode@context-mode")continue;
    for(const e of es){
      const p=e.installPath;
      if(!p)continue;
      if(!resolve(p).startsWith(cacheRoot+sep))continue;
      if(existsSync(p)){
        // Issue #727: normalize stale version paths in existing installPaths.
        // CC's auto-update can carry forward hooks.json/plugin.json with paths
        // baked to a previous version dir. Import normalize-hooks from the
        // installPath itself and let it detect + rewrite stale segments.
        try{
          // #713: narrow helper only — installPath belongs to a different
          // version's cache dir; writing plugin.json there is the #711 vector.
          const nhPath=join(p,"hooks","normalize-hooks.mjs");
          if(existsSync(nhPath)){
            const mod=await import(nhPath);
            const fn=mod.normalizeHooksJsonOnly||mod.normalizeHooksOnStartup;
            if(fn)fn({pluginRoot:p,nodePath:process.execPath,platform:process.platform});
          }
        }catch{}
        continue;
      }
      const parent=dirname(p);
      if(!existsSync(parent))continue;
      try{if(lstatSync(p).isSymbolicLink())unlinkSync(p)}catch{}
      const dirs=readdirSync(parent).filter(d=>/^\d+\.\d+/.test(d)&&statSync(join(parent,d)).isDirectory());
      if(!dirs.length)continue;
      dirs.sort((a,b)=>{const pa=a.split(".").map(Number),pb=b.split(".").map(Number);for(let i=0;i<3;i++){if((pa[i]||0)!==(pb[i]||0))return(pa[i]||0)-(pb[i]||0)}return 0});
      try{symlinkSync(join(parent,dirs[dirs.length-1]),p,process.platform==="win32"?"junction":undefined)}catch{}
    }
  }
}catch{}
