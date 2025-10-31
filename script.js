function generateGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = "";
  
  let shuffled = [...teams].sort(() => Math.random() - 0.5);
  let groups = [];

  for (let i = 0; i < 6; i++) {
    groups.push(shuffled.slice(i * 4, (i + 1) * 4));
  }

  groups.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'group';
    div.innerHTML = `<h3>Group ${String.fromCharCode(65 + i)}</h3>` +
      g.map(t => `<p>${t}</p>`).join('');
    container.appendChild(div);
  });

  localStorage.setItem('groups', JSON.stringify(groups));
}

window.onload = function() {
  const saved = localStorage.getItem('groups');
  if (saved) {
    const container = document.getElementById('groups-container');
    const groups = JSON.parse(saved);
    groups.forEach((g, i) => {
      const div = document.createElement('div');
      div.className = 'group';
      div.innerHTML = `<h3>Group ${String.fromCharCode(65 + i)}</h3>` +
        g.map(t => `<p>${t}</p>`).join('');
      container.appendChild(div);
    });
  }
};
