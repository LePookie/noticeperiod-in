const els = document.querySelectorAll('.rv');
els.forEach(e => e.classList.add('pre'));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .2 });
els.forEach(e => io.observe(e));
