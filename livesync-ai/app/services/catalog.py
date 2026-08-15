class LanguageCatalog:
    LANGUAGES = [
        {"name": "python", "display_name": "Python 3.14"},
        {"name": "javascript", "display_name": "JavaScript (Node.js 24)"},
    ]

    def get_languages(self):
        return self.LANGUAGES


catalog = LanguageCatalog()
