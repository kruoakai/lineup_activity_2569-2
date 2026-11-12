"""แปลงคู่มือ Word (docs/*.docx) เป็น HTML สำหรับหน้า "คู่มือการใช้งาน" ในแอป (อ่านบนมือถือ)
รัน: python frontend/scripts/build-manuals.py  → frontend/public/manuals/<slug>.html + index.json
ต้องมี: pip install mammoth
"""
import json
import pathlib
import re
import sys

import mammoth

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs'
OUT = ROOT / 'frontend' / 'public' / 'manuals'

# slug, ไฟล์ Word, ชื่อที่แสดง, บทบาทที่เห็นเป็นอันดับแรก, คำอธิบายสั้น
MANUALS = [
    ('teacher', 'คู่มือครูและบุคลากร ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ.docx', 'ครูและบุคลากร', ['staff'], 'เช็กชื่อ ประวัติและสถิติ ติดตั้งแอป ลืมรหัสผ่าน'),
    ('dept-head', 'คู่มือหัวหน้าแผนกและตัวแทนเช็กชื่อแผนก.docx', 'หัวหน้าแผนกและตัวแทนเช็กชื่อ', ['dept_head'], 'เช็กแทน เช็กแบบกลุ่ม รายงานแผนก'),
    ('hr', 'คู่มือเจ้าหน้าที่บุคลากร ระบบเช็กชื่อเข้าแถว.docx', 'เจ้าหน้าที่บุคลากร', ['hr'], 'ลา ราชการ มาสาย รายงานประจำวัน แก้ไขเอกสาร'),
    ('activity', 'คู่มือเจ้าหน้าที่งานกิจกรรม.docx', 'เจ้าหน้าที่งานกิจกรรม', ['activity'], 'QR อนุมัติคำขอ ปฏิทิน รายงาน'),
    ('executive', 'คู่มือผู้บริหารและผู้ลงนาม.docx', 'ผู้บริหารและผู้ลงนาม', ['executive'], 'ลงนามเอกสาร ส่งกลับแก้ไข รายงานผู้บริหาร'),
    ('admin', 'คู่มือผู้ดูแลระบบ.docx', 'ผู้ดูแลระบบ', ['admin'], 'ตั้งค่า ผู้ใช้ สำรอง/กู้คืน อีเมล น้องแถวดี'),
    ('uat', 'คู่มือการทดสอบระบบเช็กชื่อเข้าแถว (UAT).docx', 'การทดสอบระบบ (UAT)', [], 'กรณีทดสอบสำหรับคณะทำงาน'),
]


def clean(html):
    # ตัดบรรทัดวันที่ · ผู้เขียน (ชิปจากเอกสารต้นฉบับ) และหัวเรื่องแรก (หน้าแอปแสดงชื่อเอง)
    html = re.sub(r'^<h1>.*?</h1>', '', html, count=1)
    html = re.sub(r'<p>[A-Z][a-z]{2} \d{1,2}, \d{4} · @\w+</p>', '', html)
    html = re.sub(r'<p>\s*\d{4}-\d{2}-\d{2}\s*·[^<]*</p>', '', html)
    # ตารางให้เลื่อนแนวนอนได้บนมือถือ
    html = html.replace('<table>', '<div class="tw"><table>').replace('</table>', '</table></div>')
    return html.strip()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for slug, fname, title, roles, desc in MANUALS:
        src = SRC / fname
        if not src.exists():
            print('ไม่พบ', src, file=sys.stderr)
            continue
        with src.open('rb') as f:
            res = mammoth.convert_to_html(f)
        html = clean(res.value)
        (OUT / f'{slug}.html').write_text(html, encoding='utf-8')
        index.append({'slug': slug, 'title': title, 'roles': roles, 'desc': desc, 'pdf': f'{slug}.pdf'})
        pdf = SRC / fname.replace('.docx', '.pdf')
        if pdf.exists():
            (OUT / f'{slug}.pdf').write_bytes(pdf.read_bytes())
        print(slug, len(html), 'ตัวอักษร')
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
