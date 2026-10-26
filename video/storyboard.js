// ============================================================================
// 3D Virtual Office — product showcase storyboard (edit this file, re-render).
//
// Times are in seconds. Scene `start`/`end` are absolute; everything inside a
// scene (camera, cursor, clicks, highlights, toasts, typing, swap) is relative
// to the scene start. Rects are screenshot pixels (1920×1080): either a name
// from assets/shots.json (measured by capture.mjs) or { x, y, w, h }.
//
// Sound cues are derived automatically: a swoosh at each scene change, a click
// for every click, a pop for every toast / sticky note / brand reveal, and the
// typing sound for `typing` spans. Volumes live in SFX below.
// ============================================================================
window.STORYBOARD = {
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 57,
  // Optional background music (path relative to video/); leave null for SFX only.
  music: null,
  SFX: {
    swoosh: { file: "assets/sfx/swoosh.mp3", gain: 0.55 },
    click: { file: "assets/sfx/click.mp3", gain: 0.9 },
    pop: { file: "assets/sfx/pop.mp3", gain: 0.45 },
    typing: { file: "assets/sfx/typing.mp3", gain: 2.2 },
  },
  scenes: [
    {
      id: "problem", type: "problem", start: 0, end: 5.2,
      lines: ["ประชุมจบแล้ว…", "แต่งานจากที่ประชุม", "ไปอยู่ที่ไหน?"],
      notes: ["ทำสไลด์ผู้บริหาร", "ส่งใบเสนอราคา", "อัปเดตเว็บไซต์", "สรุปยอดขาย", "จองสถานที่อีเวนต์"],
    },
    {
      id: "brand", type: "brand", start: 5.2, end: 9.4,
      title: "3D Virtual Office",
      subtitle: "ออฟฟิศเสมือนที่ทำให้ทุกงานมีเจ้าของ",
    },
    {
      id: "office", type: "shot", start: 9.4, end: 15.4, shot: "02-office", captionPos: "top",
      caption: { title: "ทั้งทีม ในออฟฟิศเดียว", body: "เห็นว่าใครอยู่ไหน กำลังทำอะไร แบบเรียลไทม์" },
      camera: [{ t: 0, scale: 0.82 }, { t: 1.1, scale: 1 }, { t: 2.6, rect: "hotbar", zoom: 0.52 }, { t: 5.2, scale: 1.02 }],
      highlights: [{ t0: 2.9, t1: 5.0, rect: "hotbar", label: "กด 1–9 ไปได้ทุกที่ในออฟฟิศ" }],
      cursor: [{ t: 1.4, at: [1240, 640] }, { t: 2.6, at: [1032, 1022] }, { t: 4.6, at: [1032, 1022] }],
      clicks: [3.4],
    },
    {
      id: "meeting", type: "shot", start: 15.4, end: 21.2, shot: "03-meeting", step: "01",
      caption: { title: "จดประชุม = ได้รายการงานทันที", body: "ทุก Action item ถูกเก็บไว้ในระบบ ไม่มีงานไหนหลุด" },
      camera: [{ t: 0, scale: 1 }, { t: 1.0, rect: { x: 782, y: 218, w: 1092, h: 400 }, zoom: 1.0 }, { t: 5.8, rect: { x: 782, y: 218, w: 1092, h: 400 }, zoom: 1.04 }],
      highlights: [
        { t0: 1.4, t1: 3.0, rect: { x: 782, y: 218, w: 1092, h: 202 }, label: "สรุปประชุม" },
        { t0: 3.2, t1: 5.4, rect: { x: 782, y: 438, w: 1092, h: 190 }, label: "Action items รอแจก" },
      ],
      cursor: [{ t: 0.6, at: [1100, 700] }, { t: 1.6, at: [1200, 376] }, { t: 3.4, at: [1056, 506] }],
      clicks: [3.9],
      typing: [{ t: 1.7, dur: 1.3 }],
    },
    {
      id: "assign", type: "shot", start: 21.2, end: 27.6, shot: "04-inbox", step: "02", captionPos: "top",
      caption: { title: "มอบหมายงานในคลิกเดียว", body: "ระบบแนะนำคนที่เหมาะที่สุด พร้อมคะแนนที่อธิบายได้" },
      camera: [{ t: 0, scale: 1 }, { t: 1.0, rect: { x: 790, y: 90, w: 1100, h: 760 }, zoom: 1.0 }],
      highlights: [{ t0: 1.3, t1: 3.2, rect: { x: 800, y: 420, w: 1060, h: 330 }, label: "คำแนะนำตามกติกา — หัวหน้าเป็นผู้ตัดสินใจ" }],
      cursor: [{ t: 0.8, at: [1300, 600] }, { t: 2.2, at: [826, 228] }, { t: 3.3, at: { rect: "assign" } }, { t: 5.2, at: { rect: "assign" } }],
      clicks: [2.5, 3.7],
      toasts: [{ t: 4.0, icon: "✓", text: "มอบหมายงานให้ มานะ แล้ว", sub: "ผู้รับงานได้รับแจ้งเตือนทันที" }],
    },
    {
      id: "tasks", type: "shot", start: 27.6, end: 33.6, shot: "05-tasks", swap: { t: 2.9, shot: "05b-tasks-cards" }, step: "03",
      caption: { title: "ทุกคนเห็นงานของตัวเอง", body: "สถานะ ผู้รับผิดชอบ และเวลาที่เหลือ ชัดในแวบเดียว" },
      camera: [{ t: 0, scale: 1 }, { t: 0.9, rect: "stats", zoom: 1.35 }, { t: 2.6, scale: 1 }, { t: 3.4, rect: { x: 205, y: 178, w: 1010, h: 400 }, zoom: 1.2 }],
      highlights: [
        { t0: 1.1, t1: 2.5, rect: "stats", label: "สรุปภารกิจของทีม" },
        { t0: 3.7, t1: 5.6, rect: { x: 205, y: 178, w: 323, h: 185 }, label: "การ์ดงานพร้อมนับถอยหลัง" },
      ],
      cursor: [{ t: 3.5, at: [600, 420] }, { t: 4.4, at: [380, 280] }],
    },
    {
      id: "review", type: "shot", start: 33.6, end: 39.4, shot: "07-task-review", step: "04",
      caption: { title: "ส่งงาน · ตรวจ · อนุมัติ", body: "หัวหน้าอนุมัติได้ทันที งานที่เสร็จถูกเก็บเข้าคลังอัตโนมัติ" },
      camera: [{ t: 0, scale: 1 }, { t: 1.0, rect: "review", zoom: 1.1 }],
      highlights: [{ t0: 1.3, t1: 2.8, rect: "review", label: "รอหัวหน้าตรวจ" }],
      cursor: [{ t: 0.6, at: [1100, 420] }, { t: 2.6, at: { rect: "approve" } }, { t: 5.0, at: { rect: "approve" } }],
      clicks: [3.0],
      toasts: [{ t: 3.3, icon: "🎉", text: "อนุมัติแล้ว · เก็บเข้าคลัง", sub: "ทีมเห็นความคืบหน้าทันที" }],
    },
    {
      id: "reports", type: "shot", start: 39.4, end: 46.4, shot: "08-reports", swap: { t: 3.2, shot: "08b-reports-charts" }, step: "05",
      caption: { title: "รายงานพร้อมทันที", body: "เห็นแนวโน้ม งานเลยกำหนด และส่งออก PDF / Excel ในคลิกเดียว" },
      camera: [{ t: 0, scale: 1 }, { t: 1.0, rect: "kpis", zoom: 1.12 }, { t: 2.9, scale: 1 }, { t: 3.6, rect: { x: 205, y: 387, w: 1670, h: 370 }, zoom: 1.08 }],
      highlights: [
        { t0: 1.2, t1: 2.8, rect: "kpis", label: "เทียบกับช่วงก่อนหน้าให้อัตโนมัติ" },
        { t0: 3.9, t1: 6.4, rect: { x: 205, y: 387, w: 1031, h: 370 }, label: "แนวโน้มงานรายวัน" },
      ],
      cursor: [{ t: 0.4, at: [1500, 300] }, { t: 1.2, at: [1828, 352] }, { t: 2.2, at: [1300, 640] }],
      clicks: [1.5],
    },
    {
      id: "devices", type: "devices", start: 46.4, end: 51.2,
      phone: "11-phone", desk: "09-me",
      title: "ใช้ได้ทุกที่ ทุกอุปกรณ์",
      body: "แต่งตัวละคร มีสัตว์เลี้ยง และแชทกับทีม — ทำงานสนุกขึ้นทุกวัน",
    },
    {
      id: "outro", type: "outro", start: 51.2, end: 57,
      title: "ทำงานเป็นทีม ชัดเจน ไม่มีงานตกหล่น",
      chips: ["งานจากประชุมไม่หาย", "มอบหมายพร้อมเหตุผล", "รายงานพร้อมทันที"],
      brand: "3D Virtual Office",
      footnote: "ภาพจากระบบจริง · ข้อมูลตัวอย่างสำหรับการสาธิต",
    },
  ],
};
