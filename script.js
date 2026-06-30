const LOCAL_API_BASE = 'http://localhost:5001';
const REMOTE_HOST = 'guided-growth.onrender.com';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? LOCAL_API_BASE
  : `https://${window.location.hostname}`;

console.log('DEBUG: window.location.hostname =', window.location.hostname);
console.log('DEBUG: API_BASE =', API_BASE);

const STORAGE_KEY = 'guidedGrowthContactSubmissions';

function saveSubmissionLocally(submission) {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  saved.push({
    ...submission,
    savedAt: new Date().toISOString()
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
  });
});


/*navigation scroll */
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});


/* reveal animations while scrolling*/
const fadeElements = document.querySelectorAll('.fade-up');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, index * 80);

      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.12  
});

fadeElements.forEach(el => revealObserver.observe(el));


/* form submission*/
const contactForm = document.getElementById('contactForm');
const submitBtn   = document.getElementById('submitBtn');
const phoneInput  = document.getElementById('phone');

phoneInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '');
});

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  console.log('DEBUG: Form submitted');

  const formData = {
    fname: document.getElementById('fname').value,
    lname: document.getElementById('lname').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    service: document.getElementById('service').value,
    message: document.getElementById('message').value
  };

  // Set loading state
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled           = true;

  saveSubmissionLocally(formData);

  try {
    console.log('DEBUG: Posting to', `${API_BASE}/api/contact`);
    const response = await fetch(`${API_BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    console.log('DEBUG: Response received, status:', response.status);
    if (response.ok) {
      submitBtn.textContent        = '✓ Message Sent!';
      submitBtn.style.background   = 'var(--bark)';
      
      setTimeout(() => {
        submitBtn.textContent      = 'Send Message';
        submitBtn.style.background = '';
        submitBtn.disabled         = false;
        contactForm.reset();
      }, 3000);
    } else {
      throw new Error('Server responded with an error');
    }
  } catch (error) {
    console.error('DEBUG: Submission error:', error);
    submitBtn.textContent = 'Error! Try again';
    submitBtn.disabled = false;
  }
});
