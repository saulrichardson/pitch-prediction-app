const securityContact = `Contact: https://www.linkedin.com/in/saul-richardson
Expires: 2027-09-14T00:00:00Z
Preferred-Languages: en
Canonical: https://baseball.saulrichardson.io/.well-known/security.txt
`;

export function GET() {
  return new Response(securityContact, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
