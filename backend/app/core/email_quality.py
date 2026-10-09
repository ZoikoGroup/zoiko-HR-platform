"""Is this a real e-mail address?

Zoiko HR sends passwords, reset links and notices by e-mail and treats the address as the person's identity, so an address
that cannot receive mail (a made-up domain) or that anybody can read (a throwaway inbox, a placeholder like example.com)
is refused wherever an account or a contact address is entered.

Checks, in order:
  1. the usual shape of an address (already done by the schemas);
  2. the domain is not a placeholder / reserved name (example.com, localhost, *.test ...);
  3. the domain is not a known disposable-inbox service;
  4. the domain can receive mail: it has MX records, or failing that an address record (a DNS lookup with a short timeout).
     When the DNS lookup itself cannot be completed (no network, a slow resolver) the address is NOT refused: a faulty
     resolver must never lock real people out.

Turn the whole check off with EMAIL_REAL_ONLY=false, and only the DNS lookup with EMAIL_DNS_CHECK=false.
"""
import logging
import threading
import time
from typing import Optional

from app.config import settings

logger = logging.getLogger("zoiko.email_quality")

# Placeholder and reserved names: nobody can own an inbox there (RFC 2606 / 6761 plus the usual "type anything" domains).
PLACEHOLDER_DOMAINS = frozenset({
    "example.com", "example.org", "example.net", "example.edu", "example.co", "example.in",
    "test.com", "tests.com", "testing.com", "tester.com", "testmail.com", "testemail.com", "test.org", "test.net",
    "domain.com", "domain.org", "domain.net", "", "yourcompany.com", "yourcompany.org", "mydomain.com", "mycompany.com",
    "company.test", "email.test", "sample.com", "demo.com", "dummy.com", "fake.com", "fakemail.com", "fakeemail.com", "noemail.com", "nomail.com",
    "none.com", "null.com", "invalid.com", "asdf.com", "abc.com", "xyz.com", "abcd.com", "qwerty.com", "no-reply.com",
})
RESERVED_SUFFIXES = (".test", ".example", ".invalid", ".localhost", ".local", ".localdomain", ".internal", ".lan", ".home", ".corp", ".intranet")
RESERVED_EXACT = frozenset({"localhost", "localdomain", "invalid", "test", "example"})

# Throwaway / disposable inbox providers (a long, commonly known list; extend as new ones appear).
DISPOSABLE_DOMAINS = frozenset("""
mailinator.com mailinator.net mailinator2.com mailinater.com mailinator.org binkmail.com bobmail.info chammy.info devnullmail.com
letthemeatspam.com mailin8r.com mailinater.com mailtothis.com notmailinator.com reallymymail.com reconmail.com safetymail.info
sogetthis.com spamhereplease.com superrito.com thisisnotmyrealemail.com tradermail.info veryrealemail.com zippymail.info
guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamailblock.com sharklasers.com
grr.la guerrillamail.info pokemail.net spam4.me
10minutemail.com 10minutemail.net 10minutemail.org 10minutemail.co.uk 10minemail.com 20minutemail.com 30minutemail.com
tempmail.com temp-mail.org temp-mail.io temp-mail.ru tempmail.net tempmail.io tempmailo.com tempmailaddress.com tempinbox.com tempr.email
tempmail.dev tempmail.email temporary-mail.net temporaryemail.net temporaryemail.us tempemail.net tempemail.com tempail.com
yopmail.com yopmail.net yopmail.fr cool.fr.nf jetable.fr.nf nospam.ze.tc nomail.xl.cx mega.zik.dj speed.1s.fr courriel.fr.nf moncourrier.fr.nf monemail.fr.nf monmail.fr.nf
trashmail.com trashmail.net trashmail.org trashmail.de trashmail.io trashmail.me trashmail.at trash-mail.com trash-mail.de trashmail.ws
getnada.com nada.email nada.ltd getairmail.com airmail.cc
throwawaymail.com throwam.com throwaway.email
dispostable.com disposablemail.com disposable-email.ml disposableemailaddresses.com
maildrop.cc maildrop.cf maildrop.ga maildrop.gq maildrop.ml
fakeinbox.com fakemailgenerator.com fake-mail.net fakemail.fr fakemailgenerator.net
mintemail.com mailnesia.com mailcatch.com mailcatch.net mailexpire.com mailforspam.com mailmoat.com mailnull.com mailsac.com mailtemp.info
spambog.com spambog.de spambog.ru spambox.us spamex.com spamfree24.com spamfree24.de spamfree24.org spamgourmet.com spamgourmet.net spamgourmet.org spamherelots.com spamhole.com spamify.com spaminator.de spamkill.info spaml.com spaml.de spammotel.com spamobox.com spamoff.de spamslicer.com spamspot.com spamthis.co.uk spamthisplease.com spamtrail.com
emailondeck.com email-fake.com emailfake.com fakemail.net emailtemporanea.net emailtemporario.com.br
mohmal.com mytemp.email myspaceinc.com mt2014.com mt2015.com
moakt.com moakt.cc moakt.ws tmpmail.net tmpmail.org tmpeml.com tmail.ws
burnermail.io discard.email discardmail.com discardmail.de
33mail.com anonbox.net anonymbox.com inboxbear.com inboxalias.com inboxkitten.com
harakirimail.com incognitomail.com incognitomail.net incognitomail.org instant-mail.de
jourrapide.com armyspy.com cuvox.de dayrep.com einrot.com fleckens.hu gustr.com rhyta.com superrito.com teleworm.us
kasmail.com klzlk.com koszmail.pl kurzepost.de lifebyfood.com lortemail.dk lroid.com
 mailde.de mailde.info mailhazard.com mailhazard.us mailhz.me mailimate.com mailismagic.com mailme.lv mailme24.com mailmetrash.com mailms.com mailnator.com mailpick.biz mailproxsy.com mailquack.com mailrock.biz mailscrap.com mailseal.de mailshell.com mailsiphon.com mailslapping.com mailslite.com mailtome.de mailtrash.net mailtv.net mailzilla.com mailzilla.org
meltmail.com messagebeamer.de mezimages.net
nepwk.com nervmich.net nervtmich.net netmails.com netmails.net neverbox.com no-spam.ws nobulk.com noclickemail.com nogmailspam.info nomail2me.com nomorespamemails.com nospam4.us nospamfor.us nospammail.net notmailinator.com nowmymail.com
objectmail.com obobbo.com oneoffemail.com onewaymail.com  oopi.org ordinaryamerican.net otherinbox.com ourklips.com outlawspam.com ovpn.to owlpic.com
pjjkp.com plexolan.de pookmail.com  privatdemail.net proxymail.eu prtnx.com putthisinyouremail.com
quickinbox.com rcpt.at recode.me regbypass.com rmqkr.net  rppkn.com rtrtr.com s0ny.net  safersignup.de safetypost.de sandelf.de saynotospams.com selfdestructingmail.com sendspamhere.com sharedmailbox.org shieldedmail.com shiftmail.com shitmail.me shortmail.net  skeefmail.com slaskpost.se slopsbox.com smellfear.com snakemail.com sneakemail.com snkmail.com sofimail.com sogetthis.com soodonims.com spamarrest.com
stuffmail.de supergreatmail.com supermailer.jp  tagyourself.com talkinator.com  teewars.org teleosaurs.xyz thankyou2010.com thc.st thelimestones.com thisisnotmyrealemail.com thraml.com tilien.com tittbit.in tmailinator.com toiea.com tokenmail.de topranklist.de tradermail.info trash2009.com trashdevil.com trashemail.de trashmailer.com trashymail.com trayna.com trbvm.com turual.com twinmail.de tyldd.com
uggsrock.com  upliftnow.com uplipht.com uroid.com  venompen.com veryrealemail.com viditag.com viralplays.com vpn.st vsimcard.com vubby.com
wasteland.rfc822.org webemail.me webm4il.info weg-werf-email.de wegwerfadresse.de wegwerfemail.de wegwerfmail.de wegwerfmail.info wegwerfmail.net wegwerfmail.org wh4f.org whatiaas.com whatpaas.com whopy.com willhackforfood.biz willselfdestruct.com winemaven.info wronghead.com wuzup.net wuzupmail.net  wwwnew.eu
xagloo.com xemaps.com xents.com xmaily.com xoxy.net yapped.net   yogamaven.com yomail.info yopmail.com  yuurok.com z1p.biz  zehnminuten.de zehnminutenmail.de zippymail.info zoaxe.com zoemail.org zomg.info
""".split())

_cache: dict[str, tuple[float, bool]] = {}
_cache_lock = threading.Lock()
_CACHE_SECONDS = 6 * 3600
_DNS_TIMEOUT = 3.0


def _domain_of(email: str) -> str:
    return (email or "").rsplit("@", 1)[-1].strip().lower().rstrip(".")


def problem_with_domain(domain: str) -> Optional[str]:
    """The reason a domain cannot be used, or None. Does not touch the network."""
    d = (domain or "").strip().lower().rstrip(".")
    if not d or "." not in d and d not in RESERVED_EXACT:
        return "Enter a full email address, such as name@yourcompany.com."
    if d in RESERVED_EXACT or d in PLACEHOLDER_DOMAINS or d.endswith(RESERVED_SUFFIXES) or d.endswith(".example.com"):
        return "Enter a real email address that you can open. Placeholder addresses such as name@example.com are not accepted."
    if d in DISPOSABLE_DOMAINS or any(d.endswith("." + x) for x in DISPOSABLE_DOMAINS):
        return "Temporary or disposable email addresses are not accepted. Use your real work or personal email address."
    return None


def _domain_receives_mail(domain: str) -> Optional[bool]:
    """True/False when DNS says so, None when it could not be determined (then the address is allowed)."""
    now = time.time()
    with _cache_lock:
        hit = _cache.get(domain)
        if hit and hit[0] > now:
            return hit[1]
    try:
        import dns.exception
        import dns.resolver
    except Exception:  # pragma: no cover - dnspython missing: do not block anybody
        return None
    resolver = dns.resolver.Resolver()
    resolver.timeout = _DNS_TIMEOUT
    resolver.lifetime = _DNS_TIMEOUT
    try:
        try:
            answers = resolver.resolve(domain, "MX")
            result = any(str(r.exchange).rstrip(".") not in ("", ".") for r in answers)       # "." is the null MX: "no mail here"
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            try:
                resolver.resolve(domain, "A")
                result = True
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                try:
                    resolver.resolve(domain, "AAAA")
                    result = True
                except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                    result = False
    except dns.resolver.NXDOMAIN:
        result = False
    except (dns.exception.Timeout, dns.resolver.NoNameservers, dns.resolver.LifetimeTimeout, OSError, Exception) as exc:
        logger.debug("DNS check inconclusive for %s: %s", domain, exc)
        return None
    with _cache_lock:
        _cache[domain] = (now + _CACHE_SECONDS, result)
    return result


def check_real_email(value, *, label: str = "Email") -> Optional[str]:
    """The address, trimmed; None for a blank one. Raises ValueError with a plain message when the
    address is not a real, usable one."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if not getattr(settings, "EMAIL_REAL_ONLY", True):
        return text
    problem = problem_with_domain(_domain_of(text))
    if problem:
        raise ValueError(problem)
    if getattr(settings, "EMAIL_DNS_CHECK", True) and _domain_receives_mail(_domain_of(text)) is False:
        raise ValueError(f"{label} domain \"{_domain_of(text)}\" cannot receive email. Check the spelling, or use a different address.")
    return text
