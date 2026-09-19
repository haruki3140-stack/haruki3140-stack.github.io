export const CSS = `
:root{
  --bg:#ffffff; --surface:#f7f8fa; --border:#e3e6ea; --text:#15181d; --muted:#5d656f;
  --accent:#bf0000; --accent-soft:#fdeaea; --up:#0a7d3f; --down:#0a5ad6; --radius:12px;
  --max:960px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#101317; --surface:#181c22; --border:#2a2f37; --text:#e8eaed; --muted:#9aa3ae;
    --accent:#ff6b6b; --accent-soft:#2a1a1c; --up:#4ade80; --down:#7dabff;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--text);
  font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif;
  line-height:1.75;font-size:16px;
}
a{color:inherit}
.wrap{max-width:var(--max);margin:0 auto;padding:0 16px}
header.site{border-bottom:1px solid var(--border);background:var(--surface)}
header.site .wrap{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;padding-block:14px}
header.site .brand{font-weight:700;font-size:1.1rem;text-decoration:none}
header.site nav{display:flex;gap:14px;flex-wrap:wrap;font-size:.87rem}
header.site nav a{color:var(--muted);text-decoration:none}
header.site nav a:hover{color:var(--accent)}
.pr-badge{
  display:block;background:var(--accent-soft);border:1px solid var(--border);
  border-radius:var(--radius);padding:10px 14px;margin:18px 0;font-size:.83rem;color:var(--muted)
}
.pr-badge strong{color:var(--text)}
main{padding-block:8px 48px}
h1{font-size:1.55rem;line-height:1.4;margin:.6em 0 .3em}
h2{font-size:1.2rem;margin:2.2em 0 .6em;padding-bottom:.35em;border-bottom:2px solid var(--border)}
.meta{color:var(--muted);font-size:.85rem;margin:0 0 1.2em}
.lead p{margin:.6em 0}
.note{color:var(--muted);font-size:.82rem;margin:.2em 0 1em}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));padding:0;list-style:none;margin:0}
.list{list-style:none;margin:0;padding:0}
.card{
  border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);
  padding:14px;display:flex;flex-direction:column;gap:8px
}
.card h3{font-size:.95rem;margin:0;line-height:1.5;font-weight:600}
.card h3 a{text-decoration:none}
.card h3 a:hover{color:var(--accent)}
.card .sub{color:var(--muted);font-size:.8rem;margin:0}
.item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);align-items:flex-start}
.item:last-child{border-bottom:0}
.item .rank{
  flex:0 0 2.1rem;height:2.1rem;border-radius:50%;background:var(--accent);color:#fff;
  display:grid;place-items:center;font-weight:700;font-size:.85rem
}
.item .rank.plain{background:var(--border);color:var(--text)}
.item img{width:88px;height:88px;object-fit:contain;border-radius:8px;background:#fff;flex:0 0 88px}
.item .body{flex:1;min-width:0}
.item .name{font-weight:600;font-size:.95rem;margin:0 0 4px;line-height:1.55}
.item .name a{text-decoration:none}
.item .name a:hover{text-decoration:underline}
.item .shop{color:var(--muted);font-size:.8rem;margin:0 0 6px;overflow-wrap:anywhere}
.price{font-size:1.05rem;font-weight:700;color:var(--accent)}
.price .was{font-size:.8rem;font-weight:400;color:var(--muted);text-decoration:line-through;margin-left:6px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tag{font-size:.74rem;border:1px solid var(--border);border-radius:999px;padding:1px 9px;color:var(--muted);background:var(--bg)}
.tag.up{color:var(--up);border-color:var(--up)}
.tag.down{color:var(--down);border-color:var(--down)}
.tag.new{color:var(--accent);border-color:var(--accent)}
.buy{
  display:inline-block;margin-top:8px;background:var(--accent);color:#fff;text-decoration:none;
  padding:7px 16px;border-radius:999px;font-size:.85rem;font-weight:600
}
.buy:hover{opacity:.88}
footer.site{border-top:1px solid var(--border);background:var(--surface);padding-block:24px;color:var(--muted);font-size:.82rem}
footer.site a{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 24px;padding:0;list-style:none}
.chips a{
  display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 14px;
  font-size:.85rem;text-decoration:none;background:var(--surface)
}
.chips a:hover{border-color:var(--accent);color:var(--accent)}
.empty{border:1px dashed var(--border);border-radius:var(--radius);padding:28px;text-align:center;color:var(--muted)}
@media (max-width:520px){
  h1{font-size:1.3rem}
  .item img{width:68px;height:68px;flex-basis:68px}
}
`;
