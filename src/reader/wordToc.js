// src/reader/wordToc.js — tách từ BookReader.jsx (khối Word html/txt/md)
// Chỉ chứa phần THUẦN (phân trang html + parse headings → items).
// Phần state/cache (safeGetJSON, findTocBook, setTocItems) giữ trong BookReader,
// ở đây nhận tham số truyền vào, không copy state ra ngoài.

// Phân trang html thành các trang ~3000 ký tự text — y hệt useMemo htmlBookPages cũ.
export function paginateHtmlContent(htmlBookContent) {
  const raw = htmlBookContent || "";
  if(!raw || raw.includes("Chưa có nội dung")||raw.includes("Chua co noi dung")) return [raw];
  try{
    const tmp=document.createElement("div");
    tmp.innerHTML=raw;
    const nodes=Array.from(tmp.childNodes);
    if(!nodes.length) return [raw];
    const pages=[]; let cur=""; let curLen=0; const limit=3000;
    const plainLen=(h)=>{ const d=document.createElement("div"); d.innerHTML=h; return (d.textContent||"").length; };
    const chunkLongBlock=(out, len)=>{
      if(len <= limit) return [out];
      try{
        const t=document.createElement("div"); t.innerHTML=out;
        const el=t.firstElementChild;
        if(!el) return [out];
        const tag=(el.tagName||"").toLowerCase();
        if(["table","pre","ul","ol"].includes(tag)) return [out];
        const text=(el.textContent||"").trim();
        if(!text || text.length <= limit) return [out];
        const chunks=[]; let pos=0;
        while(pos < text.length){
          let end=Math.min(pos+limit, text.length);
          if(end < text.length){ const sp=text.lastIndexOf(" ", end); if(sp > pos+800) end=sp; }
          const piece=text.slice(pos, end).trim();
          if(piece) chunks.push(`<${tag}>${piece.replace(/</g,"&lt;")}</${tag}>`);
          pos=end;
        }
        return chunks.length? chunks : [out];
      }catch{ return [out]; }
    };
    for(const n of nodes){
      const out=n.outerHTML ?? `<p>${(n.textContent||"").replace(/</g,"&lt;")}</p>`;
      const len=plainLen(out) || Math.ceil(out.length/3);
      const pieces=chunkLongBlock(out, len);
      for(const piece of pieces){
        const pLen=plainLen(piece) || Math.ceil(piece.length/3);
        if(curLen + pLen > limit && cur){ pages.push(cur); cur=piece; curLen=pLen; } else { cur+=piece; curLen+=pLen; }
      }
    }
    if(cur) pages.push(cur);
    return pages.length? pages : [raw];
  }catch{ return [raw]; }
}

// Parse h1/h2/h3 trong html → items TOC y hệt PDF (id/title/page/pdfPage/depth).
// Tham số truyền vào từ BookReader, không đọc state ngoài.
export function parseWordHeadingsToToc(htmlBookContent, pagesLength, bookTitle) {
  try {
    const tmp=document.createElement("div");
    tmp.innerHTML=htmlBookContent;
    const heads=tmp.querySelectorAll("h1,h2,h3");
    if(!heads.length){
      // fallback 1 mục cho sách word
      return [{ id:"word-toc-0", title: bookTitle || "Nội dung chính", page:1, pdfPage:1, depth:0 }];
    }
    const total = pagesLength || 1;
    return Array.from(heads).map((el, idx)=>{
      const tag=el.tagName.toLowerCase();
      const depth=tag==="h1"?0: tag==="h2"?1:2;
      // phân trang ước lượng theo htmlBookPages
      const page=Math.min(total, Math.max(1, Math.floor(idx * total / heads.length)+1));
      return { id:`word-toc-${idx}`, title: (el.textContent||"").trim().slice(0,90) || `Mục ${idx+1}`, page, pdfPage: page, depth };
    });
  } catch { return []; }
}
