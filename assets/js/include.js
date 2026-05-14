const NAV_HTML = `
<nav class="navbar">
    <div class="nav-container">
        <a href="index.html" class="nav-logo">Jan van Roestel</a>
        <button class="nav-toggle" aria-label="Toggle navigation">
            <span></span>
            <span></span>
            <span></span>
        </button>
        <ul class="nav-menu">
            <li><a href="index.html" data-page="home">Home</a></li>
            <li><a href="research.html" data-page="research">Research</a></li>
            <li><a href="data-code.html" data-page="data">Data &amp; Code</a></li>
            <li><a href="talks.html" data-page="talks">Talks</a></li>
            <li><a href="cv.html" data-page="cv">CV</a></li>
            <li><a href="contact.html" data-page="contact">Contact</a></li>
        </ul>
    </div>
</nav>
`;

const FOOTER_HTML = `
<footer>
    <div class="container">
        <p>&copy; Jan van Roestel. All rights reserved.</p>
    </div>
</footer>
`;

function writeNav() { document.write(NAV_HTML); }
function writeFooter() { document.write(FOOTER_HTML); }

document.addEventListener('DOMContentLoaded', function () {
    const page = document.body.dataset.page;
    if (page) {
        const link = document.querySelector(`.nav-menu a[data-page="${page}"]`);
        if (link) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        }
    }
    const toggle = document.querySelector('.nav-toggle');
    if (toggle) {
        toggle.addEventListener('click', function () {
            document.querySelector('.nav-menu').classList.toggle('active');
        });
    }
});
