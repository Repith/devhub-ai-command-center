import { Injectable } from "@nestjs/common";

import { TokenCrypto } from "@devhub/database";

@Injectable()
export class GithubTokenCryptoService extends TokenCrypto {}
