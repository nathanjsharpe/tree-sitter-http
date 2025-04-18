import { choice, token, prec, seq } from "tree-sitter-tools";

NL = token(choice("\n", "\r", "\r\n", "\u0000"));
WS = /\\p{Zs}+/u;
CHAR = /[\\p{L}\\p{N}]/u;

export default grammar({
  rules: {
    document: $ => repeat($.section),
    WORD_CHAR: CHAR,
    PUNCTUATION: /[^\\n\\r\\p{Z}\\p{L}\\p{N}]/,
    WS,
    NL,
    LINE_TAIL: $ => seq(/.*/, NL),
    _comment_prefix: $ =>
      choice(token(prec(2, /#\\s*/)), token(prec(2, /\\\/\\\/\\s*/))),
    comment: $ =>
      seq(
        $._comment_prefix,
        choice(
          seq(
            token(prec(2, "@")),
            field("name", $.identifier),
            choice(
              seq(
                choice(WS, "="),
                choice(token(prec(1, WS)), blank()),
                field("value", $.value),
              ),
              blank(),
            ),
            NL,
          ),
          token(seq(/.*/, NL)),
        ),
      ),
    var_comment: $ =>
      seq(
        $._comment_prefix,
        token(prec(2, "@")),
        field("name", $.identifier),
        choice(
          seq(
            choice(WS, "="),
            choice(token(prec(1, WS)), blank()),
            field("value", $.value),
          ),
          blank(),
        ),
        NL,
      ),
    request_separator: $ =>
      seq(
        token(prec(3, /###+\\p{Zs}*/)),
        choice(token(prec(1, WS)), blank()),
        choice(field("value", $.value), blank()),
        NL,
      ),
    section: $ =>
      prec.right(
        0,
        choice(
          seq($.request_separator, choice($._section_content, blank())),
          $._section_content,
        ),
      ),
    _section_content: $ =>
      choice(
        seq($.import_statement, choice([$._section_content, blank()])),
        seq($._blank_line, choice($._section_content, blank())),
        seq($.comment, choice($._section_content, blank())),
        seq($._blank_line, choice($._section_content, blank())),
        seq($.comment, choice($._section_content, blank())),
        seq($.variable_declaration, choice($._section_content, blank())),
        seq($.pre_request_script, choice($._section_content, blank())),
        seq(
          field("request", $.request),
          repeat(
            choice(
              seq(alias($.var_comment, "comment"), repeat(NL)),
              seq($.res_handler_script, repeat(NL)),
            ),
          ),
        ),
      ),
    method:
      /(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|PATCH|LIST|GRAPHQL|WEBSOCKET)/,
    http_version: token(prec(0, /HTTP\/[\d\.]+/)),
    _target_url_line: $ =>
      repeat1(choice(CHAR, /[^\\n\\r\\p{Z}\\p{L}\\p{N}]/u, $.variable)),
    target_url: $ =>
      seq($._target_url_line, repeat(seq(NL, WS, $._target_url_line))),
    status_code: /[1-5]\\d{2}/,
    status_text:
      /(Continue|Switching Protocols|Processing|OK|Created|Accepted|Non-Authoritative Information|No Content|Reset Content|Partial Content|Multi-Status|Already Reported|IM Used|Multiple Choices|Moved Permanently|Found|See Other|Not Modified|Use Proxy|Switch Proxy|Temporary Redirect|Permanent Redirect|Bad Request|Unauthorized|Payment Required|Forbidden|Not Found|Method Not Allowed|Not Acceptable|Proxy Authentication Required|Request Timeout|Conflict|Gone|Length Required|Precondition Failed|Payload Too Large|URI Too Long|Unsupported Media Type|Range Not Satisfiable|Expectation Failed|I'm a teapot|Misdirected Request|Unprocessable Entity|Locked|Failed Dependency|Too Early|Upgrade Required|Precondition Required|Too Many Requests|Request Header Fields Too Large|Unavailable For Legal Reasons|Internal Server Error|Not Implemented|Bad Gateway|Service Unavailable|Gateway Timeout|HTTP Version Not Supported|Variant Also Negotiates|Insufficient Storage|Loop Detected|Not Extended|Network Authentication Required)/,
    response: $ =>
      seq($.http_version, WS, $.status_code, WS, $.status_text, NL),
    request: $ =>
      prec.right(
        0,
        seq(
          choice(seq(field("method", $.method), /\\p{Zs}+/), blank()),
          field("url", $.target_url),
          choice(seq(WS, field("version", $.http_version)), blank()),
          NL,
          repeat($.comment),
          choice($.response, blank()),
          repeat(field("header", $.header)),
          choice(
            seq(
              repeat1($._blank_line),
              repeat(alias($.var_comment, "comment")),
              choice(
                field(
                  "body",
                  choice(
                    $.raw_body,
                    $.multipart_form_data,
                    $.xml_body,
                    $.json_body,
                    $.graphql_body,
                    $._external_body,
                  ),
                ),
                blank(),
              ),
              blank(),
            ),
          ),
        ),
      ),
    query_param: $ =>
      prec.right(
        0,
        seq(
          field("key", $.value),
          choice(seq("=", choice(field("value", $.value), blank())), blank()),
        ),
      ),
    header: $ =>
      seq(
        field("name", $.header_entity),
        choice(WS, blank()),
        ":",
        choice(token(prec(1, WS)), blank()),
        choice(field("value", $.value), blank()),
        NL,
      ),
    variable: $ =>
      seq(
        token(prec(1, "{{")),
        choice(WS, blank()),
        field("name", $.identifier),
        choice(WS, blank()),
        token(prec(1, "}}")),
      ),
    pre_request_script: $ => seq("<", WS, choice($.script, $.path), NL),
    res_handler_script: $ =>
      seq(token(prec(3, ">")), WS, choice($.script, $.path), NL),
    script: $ =>
      seq(
        token(prec(1, "{%")),
        NL,
        repeat(token(seq(/.*/, NL))),
        token(prec(1, "%}")),
      ),
    variable_declaration: $ =>
      seq(
        "@",
        field("name", $.identifier),
        choice(WS, blank()),
        "=",
        choice(token(prec(1, WS)), blank()),
        field("value", $.value),
        NL,
      ),
    xml_body: $ =>
      seq(token(prec(2, /<[^\\s@]/)), repeat1(token(seq(/.*/, NL)))),
    json_body: $ =>
      seq(token(prec(2, /[{\\[]\\s+/)), repeat1(token(seq(/.*/, NL)))),
    graphql_body: $ => seq($.graphql_data, choice($.json_body, blank())),
    graphql_data: $ =>
      seq(
        token(prec(2, seq(choice("query", "mutation"), WS, /.*\\{/, NL))),
        repeat1(token(seq(/.*/, NL))),
      ),
    _external_body: $ => seq($.external_body, NL),
    external_body: $ =>
      seq(
        token(prec(2, "<")),
        choice(seq("@", field("name", $.identifier)), blank()),
        WS,
        field("path", $.path),
      ),
    multipart_form_data: prec.right(
      0,
      seq(
        token(prec(2, "--")),
        token(seq(/.*/, NL)),
        repeat(
          choice(
            $._blank_line,
            $.comment,
            seq($.external_body, choice(WS, NL)),
            token(prec(1, token(seq(/.*/, NL)))),
          ),
        ),
      ),
    ),
    // // $._raw_body,
    _raw_body: $ =>
      seq(
        choice(
          token(prec(1, token(seq(/.*/, NL)))),
          seq($._comment_prefix, $._not_comment),
        ),
        choice($._raw_body, blank()),
      ),
    _not_comment: $ => token(seq(/[^@]*/, NL)),
    header_entity: /[\\w\\-]+/,
    identifier: /[A-Za-z_.\\$\\d\\u00A1-\\uFFFF-]+/,
    path: $ =>
      prec.right(
        0,
        repeat1(
          choice(
            CHAR,
            /[^\\n\\r\\p{Z}\\p{L}\\p{N}]/u,
            $.variable,
            token(/\\\\[^\\n\\r]/),
          ),
        ),
      ),
    value: $ =>
      repeat1(choice(CHAR, /[^\\n\\r\\p{Z}\\p{L}\\p{N}]/u, $.variable, WS)),
    _blank_line: $ => seq(choice(WS, blank()), token(prec(-1, NL))),
  },
  extras: [],
  conflicts: [["target_url"], ["_raw_body"], ["_section_content"]],
  precedences: [],
  externals: [],
  inline: ["_target_url_line"],
  supertypes: [],
  reserved: {},
});
