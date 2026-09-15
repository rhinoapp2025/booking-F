<script setup>
defineProps({
  cancellationPolicy: { type: String, default: '' },
  nonSmoking: { type: Boolean, default: false },
  nonSmokingFine: { type: [Number, String], default: 0 },
})

function formatFine(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toLocaleString('th-TH')
}
</script>

<template>
  <div v-if="cancellationPolicy || nonSmoking" class="booking-policies">
    <div v-if="nonSmoking" class="policy-block">
      <p class="policy-chip">
        <i class="ti ti-smoking-no" aria-hidden="true"></i>
        Non smoking / ปลอดบุหรี่
      </p>
      <p v-if="formatFine(nonSmokingFine)" class="policy-text">
        ค่าปรับหากสูบบุหรี่ ฿{{ formatFine(nonSmokingFine) }}
      </p>
    </div>
    <div v-if="cancellationPolicy" class="policy-block">
      <p class="policy-label">นโยบายยกเลิก</p>
      <p class="policy-text">{{ cancellationPolicy }}</p>
    </div>
  </div>
</template>

<style scoped>
.booking-policies {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.policy-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}
.policy-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.policy-label {
  margin: 0;
  font-size: var(--text-label);
  font-weight: 600;
  color: var(--color-text-muted);
}
.policy-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  line-height: 1.5;
}
</style>
