// Client-side image compression
export async function compressFile(file: File, { maxW = 1600, maxH = 1600, quality = 0.7, type = 'image/webp' } = {}): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratio = Math.min(1, maxW / w, maxH / h);
        const rw = Math.round(w * ratio);
        const rh = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = rw;
        canvas.height = rh;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, rw, rh);
          let out = canvas.toDataURL(type, quality);
          if (type === 'image/webp' && !out.startsWith('data:image/webp')) {
            out = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(out);
        } else {
          resolve('');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Generate variants
export async function generateVariants(file: File) {
  const display = await compressFile(file, { maxW: 1600, maxH: 1600, quality: 0.7 });
  const medium = await compressFile(file, { maxW: 800, maxH: 800, quality: 0.6 });
  const thumb = await compressFile(file, { maxW: 320, maxH: 320, quality: 0.5 });
  return { display, medium, thumb };
}

// EXIF Extraction
export function extractExif(file: File): Promise<any> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = new Uint8Array(e.target?.result as ArrayBuffer);
      if (buf[0] !== 0xFF || buf[1] !== 0xD8) return resolve({});
      let off = 2;
      while (off + 4 <= buf.length) {
        if (buf[off] !== 0xFF) break;
        const marker = buf[off + 1];
        const len = (buf[off + 2] << 8) | buf[off + 3];
        if (marker === 0xE1) {
          const start = off + 4;
          if (buf[start] === 0x45 && buf[start + 1] === 0x78 && buf[start + 2] === 0x69 && buf[start + 3] === 0x66 && buf[start + 4] === 0 && buf[start + 5] === 0) {
            const tiff = start + 6;
            const be = (buf[tiff] === 0x4D && buf[tiff + 1] === 0x4D);
            const dv = new DataView(e.target?.result as ArrayBuffer);
            const td = new TextDecoder();
            const u16 = (p: number) => be ? dv.getUint16(p, false) : dv.getUint16(p, true);
            const u32 = (p: number) => be ? dv.getUint32(p, false) : dv.getUint32(p, true);
            const ifd0 = tiff + u32(tiff + 4);
            const n = u16(ifd0);
            let exifIfd = 0;
            const o: any = {};
            
            function readAscii(c: number, vo: number) {
              if (c <= 4) { return td.decode(buf.slice(vo, vo + c - 1)); }
              const abs = tiff + u32(vo);
              return td.decode(buf.slice(abs, abs + c - 1));
            }
            
            function readR(vo: number) {
              const abs = tiff + u32(vo);
              const num = u32(abs);
              const den = u32(abs + 4);
              if (den) {
                const v = num / den;
                return { raw: `${num}/${den}`, val: v };
              }
              return { raw: `${num}/0`, val: num };
            }

            for (let i = 0; i < n; i++) {
              const e1 = ifd0 + 2 + i * 12;
              const tag = u16(e1);
              const type = u16(e1 + 2);
              const count = u32(e1 + 4);
              const vo = e1 + 8;
              if (tag === 0x010F && type === 2) o.Make = readAscii(count, vo);
              if (tag === 0x0110 && type === 2) o.Model = readAscii(count, vo);
              if (tag === 0x0112) { const p = count === 1 ? vo : tiff + u32(vo); o.Orientation = u16(p); }
              if (tag === 0x0132 && type === 2) o.DateTime = readAscii(count, vo);
              if (tag === 0x8769) exifIfd = tiff + u32(vo);
            }
            
            if (exifIfd) {
              const n2 = u16(exifIfd);
              for (let i = 0; i < n2; i++) {
                const e2 = exifIfd + 2 + i * 12;
                const tag = u16(e2);
                const type = u16(e2 + 2);
                const count = u32(e2 + 4);
                const vo = e2 + 8;
                if (tag === 0x9003 && type === 2) { o.DateTimeOriginal = readAscii(count, vo); }
                if (tag === 0x829A && type === 5) { const r = readR(vo); o.ExposureTime = r.raw; o.Shutter = r.val >= 1 ? `${Math.round(r.val)}s` : `1/${Math.round(1 / r.val)}`; }
                if (tag === 0x829D && type === 5) { const r = readR(vo); o.FNumber = r.raw; o.Aperture = `f/${r.val.toFixed(1)}`; }
                if (tag === 0x8827) { const p = count === 1 ? vo : tiff + u32(vo); o.ISO = u16(p); }
                if (tag === 0x920A && type === 5) { const r = readR(vo); o.FocalLength = `${r.val.toFixed(1)}mm`; }
              }
            }
            resolve(o); return;
          }
        }
        off += 2 + len;
      }
      resolve({});
    };
    reader.readAsArrayBuffer(file);
  });
}
