<template>
  <!-- เครดิตผู้พัฒนา: เรียบ สุภาพ น่าเชื่อถือ ใช้ได้ทั้งหน้าเข้าสู่ระบบ คู่มือ และเมนูเพิ่มเติม -->
  <footer class="credits" aria-label="ผู้พัฒนาระบบ">
    <div class="label"><span>พัฒนาโดย</span></div>
    <div class="devs">
      <span class="dev">ครูอลงกรณ์ ภูคงคา</span>
      <span class="sep" aria-hidden="true">•</span>
      <span class="dev">ครูกฤษณา แนววิเศษ</span>
    </div>
    <div class="team">และทีมงาน</div>
    <div class="org">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path fill="currentColor" d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zm-6.82 9.36L5 13.18v3.82L12 21l7-4v-3.82l-.18-.82L12 16 5.18 12.36z" />
      </svg>
      <span>แผนกวิชาเทคโนโลยีสารสนเทศ <span class="nb">วิทยาลัยเทคนิคชัยภูมิ</span></span>
    </div>
  </footer>
</template>

<style scoped>
.credits { margin: 22px auto 6px; max-width: 360px; text-align: center; color: var(--muted); }
.label { display: flex; align-items: center; gap: 10px; font-size: .72rem; letter-spacing: .08em; margin-bottom: 6px; }
.label::before, .label::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--line)); }
.label::after { background: linear-gradient(90deg, var(--line), transparent); }
.devs { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 8px; }
.dev { font-weight: 700; font-size: .92rem; color: var(--brand); }
.sep { color: var(--line); font-size: .8rem; }
.team { font-size: .8rem; margin-top: 1px; }
.org { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); font-size: .76rem; line-height: 1.4; }
.org svg { color: var(--brand-2); flex: none; }
.nb { white-space: nowrap; }
@media (max-width: 440px) { .sep { display: none; } .devs { flex-direction: column; gap: 0; } }
</style>
