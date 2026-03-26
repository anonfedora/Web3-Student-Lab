use super::*;
use soroban_sdk::{symbol_short, testutils::Ledger, Env, String};

#[test]
fn issues_and_loads_certificate_successfully() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CertificateContract);
    let client = CertificateContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|ledger| ledger.timestamp = 1_234);

    let symbol = symbol_short!("SOLID");
    let student = String::from_str(&env, "Ada Lovelace");
    let course_name = String::from_str(&env, "Rust 101");

    let issued = client.issue(
        &symbol,
        &student,
        &course_name,
    );

    assert_eq!(
        issued,
        Certificate {
            symbol: symbol.clone(),
            student,
            course_name,
            issue_date: 1_234,
        }
    );

    let stored = client.get_certificate(&symbol);
    assert_eq!(stored, Some(issued));
}

#[test]
fn returns_none_for_non_existent_certificate() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CertificateContract);
    let client = CertificateContractClient::new(&env, &contract_id);

    let symbol = symbol_short!("MISSIN");

    let stored = client.get_certificate(&symbol);
    assert!(stored.is_none());
}
