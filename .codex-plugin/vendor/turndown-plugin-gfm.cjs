"use strict";var N=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports);var p=N(i=>{"use strict";Object.defineProperty(i,"__esModule",{value:!0});var s=/highlight-(?:text|source)-([a-z0-9]+)/;function f(t){t.addRule("highlightedCodeBlock",{filter:function(e){var r=e.firstChild;return e.nodeName==="DIV"&&s.test(e.className)&&r&&r.nodeName==="PRE"},replacement:function(e,r,n){var a=r.className||"",o=(a.match(s)||[null,""])[1];return`

`+n.fence+o+`
`+r.firstChild.textContent+`
`+n.fence+`

`}})}function d(t){t.addRule("strikethrough",{filter:["del","s","strike"],replacement:function(e){return"~"+e+"~"}})}var v=Array.prototype.indexOf,b=Array.prototype.every,l={};l.tableCell={filter:["th","td"],replacement:function(t,e){return h(t,e)}};l.tableRow={filter:"tr",replacement:function(t,e){var r="",n={left:":--",right:"--:",center:":-:"};if(u(e))for(var a=0;a<e.childNodes.length;a++){var o="---",c=(e.childNodes[a].getAttribute("align")||"").toLowerCase();c&&(o=n[c]||o),r+=h(o,e.childNodes[a])}return`
`+t+(r?`
`+r:"")}};l.table={filter:function(t){return t.nodeName==="TABLE"&&u(t.rows[0])},replacement:function(t){return t=t.replace(`

`,`
`),`

`+t+`

`}};l.tableSection={filter:["thead","tbody","tfoot"],replacement:function(t){return t}};function u(t){var e=t.parentNode;return e.nodeName==="THEAD"||e.firstChild===t&&(e.nodeName==="TABLE"||k(e))&&b.call(t.childNodes,function(r){return r.nodeName==="TH"})}function k(t){var e=t.previousSibling;return t.nodeName==="TBODY"&&(!e||e.nodeName==="THEAD"&&/^\s*$/i.test(e.textContent))}function h(t,e){var r=v.call(e.parentNode.childNodes,e),n=" ";return r===0&&(n="| "),n+t+" |"}function g(t){t.keep(function(r){return r.nodeName==="TABLE"&&!u(r.rows[0])});for(var e in l)t.addRule(e,l[e])}function m(t){t.addRule("taskListItems",{filter:function(e){return e.type==="checkbox"&&e.parentNode.nodeName==="LI"},replacement:function(e,r){return(r.checked?"[x]":"[ ]")+" "}})}function C(t){t.use([f,d,g,m])}i.gfm=C;i.highlightedCodeBlock=f;i.strikethrough=d;i.tables=g;i.taskListItems=m});module.exports=p();
