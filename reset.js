function resetTournament() {
  if (!confirm("Reset tournament and clear saved data?")) return;
  localStorage.removeItem('ef_groups');
  localStorage.removeItem('ef_matches');
  localStorage.removeItem('ef_generatedRounds');
  localStorage.removeItem('ef_knockout');
  alert('Tournament reset.');
  // reload to reflect change
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  // hook reset buttons if present
  const r1 = document.getElementById('resetBtn');
  if (r1) r1.addEventListener('click', resetTournament);
  const r2 = document.getElementById('resetBtn2');
  if (r2) r2.addEventListener('click', resetTournament);
});
