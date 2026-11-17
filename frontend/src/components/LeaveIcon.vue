<template>
  <!-- ไอคอนเส้นชุดเดียวกันของประเภทคำแจ้ง: ใช้ทั้งหน้าแจ้งลา รายการคำแจ้ง และหน้าตรวจของเจ้าหน้าที่ -->
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- ลาป่วย: กระเป๋าพยาบาล -->
    <template v-if="kind === 'sick'">
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M12 10.5v6M9 13.5h6" />
    </template>
    <!-- ลากิจ: ปฏิทินกับบุคคล (ธุระส่วนตัว) -->
    <template v-else-if="kind === 'personal'">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="14" r="1.8" />
      <path d="M8.8 19c.5-1.6 1.7-2.5 3.2-2.5s2.7.9 3.2 2.5" />
    </template>
    <!-- ไปราชการ: อาคารราชการ -->
    <template v-else-if="kind === 'official'">
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4.5 10h15" />
      <path d="M6.5 10v7M10 10v7M14 10v7M17.5 10v7" />
      <path d="M3.5 20h17M4.5 17.5h15" />
    </template>
    <!-- งานนโยบาย: เป้าหมาย/ธง -->
    <template v-else-if="kind === 'policy'">
      <path d="M5 21V4" />
      <path d="M5 4.5h11.5l-2 3.5 2 3.5H5" />
      <path d="M9 21h-4" />
    </template>
    <!-- ลาอื่น ๆ: เอกสารแบบฟอร์ม -->
    <template v-else>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h7M8.5 16.5h4.5" />
    </template>
  </svg>
</template>

<script setup>
defineProps({ kind: { type: String, default: '' }, size: { type: [Number, String], default: 22 } });
</script>
