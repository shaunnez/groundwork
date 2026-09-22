import { deflateSync } from "node:zlib";
import { createCanvas } from "@napi-rs/canvas";
export function zipParts(parts: Record<string, string>): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  const crc32 = (buffer: Buffer) => {
    let crc = 0xffffffff;
    for (const b of buffer) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const [name, value] of Object.entries(parts)) {
    const bytes = Buffer.from(value),
      filename = Buffer.from(name),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt32LE(crc32(bytes), 16);
    index.writeUInt32LE(bytes.length, 20);
    index.writeUInt32LE(bytes.length, 24);
    index.writeUInt16LE(filename.length, 28);
    index.writeUInt32LE(offset, 42);
    central.push(index, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(local.length / 3, 8);
  end.writeUInt16LE(local.length / 3, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function pdfObjects(objects: (string | Buffer)[]): Buffer {
  const pieces = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let size = pieces[0].length;
  objects.forEach((object, i) => {
    offsets.push(size);
    const part = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.from(object),
      Buffer.from("\nendobj\n"),
    ]);
    pieces.push(part);
    size += part.length;
  });
  pieces.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((x) => `${String(x).padStart(10, "0")} 00000 n \n`)
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`,
    ),
  );
  return Buffer.concat(pieces);
}
export function nativePdf(rotation = 0): Buffer {
  const content =
    "BT /F1 16 Tf 60 650 Td (Suppliers must submit Form X.) Tj ET";
  return pdfObjects([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate ${rotation} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}
export function scannedPdf(withHeader = false, cropped = false): Buffer {
  const width = 1224,
    height = 1584,
    canvas = createCanvas(width, height),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = "32px sans-serif";
  ctx.fillText("Suppliers must submit Form X.", 120, 300);
  ctx.fillText("Closing date: 30 September 2026.", 120, 370);
  const rgba = ctx.getImageData(0, 0, width, height).data,
    rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  const data = deflateSync(rgb),
    content =
      "q 612 0 0 792 0 0 cm /Im1 Do Q" +
      (withHeader
        ? "\nBT /F1 12 Tf 60 750 Td (Synthetic tender header) Tj ET"
        : "");
  return pdfObjects([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${cropped ? "/CropBox [40 100 572 750]" : ""} /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`,
      ),
      data,
      Buffer.from("\nendstream"),
    ]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}
export function workbook(extra = ""): Buffer {
  return zipParts({
    "xl/workbook.xml":
      '<workbook xmlns:r="r"><sheets><sheet name="Prices" sheetId="1" r:id="r1"/><sheet name="Hidden" state="hidden" sheetId="2" r:id="r2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="r1" Type="office/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="office/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Mandatory form</t></si></sst>",
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>0</v></c><c r="C1" t="b"><v>0</v></c><c r="D1"><f>B1*2</f><v>0</v></c>${extra}</row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Insurance required</t></is></c></row></sheetData></worksheet>',
  });
}
export function wordDocument(extra = ""): Buffer {
  return zipParts({
    "word/document.xml": `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Submit Form X.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Insurance</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Required</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${extra}</w:body></w:document>`,
    "word/header1.xml":
      '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Synthetic tender</w:t></w:r></w:p></w:hdr>',
  });
}
